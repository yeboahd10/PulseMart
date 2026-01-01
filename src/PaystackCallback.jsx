import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { doc, getDoc, collection, query, where, getDocs, serverTimestamp, runTransaction, setDoc, addDoc } from 'firebase/firestore'
import axios from 'axios'
import { db } from './firebase'
import Spinner from './components/Spinner'
import { getAuth } from 'firebase/auth'

const PaystackCallback = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, initializing, login } = useAuth()
  const [status, setStatus] = useState(null)

  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref')
    if (!reference) return

    // Wait until auth initialization completes so we know if user is signed in
    if (initializing) return

    const verify = async () => {
      try {
        let body = null
        try {
          const resp = await fetch('/.netlify/functions/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference })
          })
          if (!resp.ok) {
            let text = ''
            try { text = await resp.text(); const maybeJson = JSON.parse(text || '{}'); throw new Error(maybeJson.message || JSON.stringify(maybeJson) || resp.statusText) } catch (e) { throw new Error(text || resp.statusText || `HTTP ${resp.status}`) }
          }
          body = await resp.json()
        } catch (netlifyErr) {
          console.warn('Netlify verify failed, falling back to local server', netlifyErr)
          const fallbackResp = await fetch('http://localhost:5000/api/paystack/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference })
          })
          if (!fallbackResp.ok) {
            let text = ''
            try { text = await fallbackResp.text(); const maybeJson = JSON.parse(text || '{}'); throw new Error(maybeJson.message || JSON.stringify(maybeJson) || fallbackResp.statusText) } catch (e) { throw new Error(text || fallbackResp.statusText || `HTTP ${fallbackResp.status}`) }
          }
          body = await fallbackResp.json()
        }

        const tx = body?.data
        if (tx && tx.status === 'success') {
          const amountGhs = Number(tx.amount) / 100

          // Determine how much to credit the user's account.
          // If the Paystack transaction included metadata with the original amount or purchase shortfall,
          // credit only that original amount (so the 2% payment fee does not remain in the user's balance).
          let creditAmount = amountGhs
          try {
            const meta = tx.metadata || {}
            // Common places we might find the original amount or shortfall depending on caller
            // - metadata.originalAmount (used by Dashboard top-up)
            // - metadata.purchase.shortfall (used by purchase flows)
            if (meta.originalAmount && !isNaN(Number(meta.originalAmount))) {
              creditAmount = Number(meta.originalAmount)
            } else if (meta.purchase && meta.purchase.shortfall && !isNaN(Number(meta.purchase.shortfall))) {
              creditAmount = Number(meta.purchase.shortfall)
            } else if (meta.purchase && meta.purchase.displayPrice && meta.purchase.fee && !isNaN(Number(meta.purchase.displayPrice))) {
              // If only displayPrice and fee present, assume we should credit displayPrice
              creditAmount = Number(meta.purchase.displayPrice)
            }
          } catch (e) {
            console.warn('Failed to parse transaction metadata for credit amount, defaulting to full amount', e)
          }
          // Ensure creditAmount is not greater than amountGhs
          creditAmount = Math.min(Number(creditAmount) || 0, amountGhs)

          // attempt to resolve user: prefer context `user`/auth uid, else locate by email in Firestore
          const auth = getAuth()
          const fbUser = user ?? auth.currentUser
          let userRef

          if (fbUser && fbUser.uid) {
            userRef = doc(db, 'users', fbUser.uid)
          } else {
            // try to locate user by email from Paystack transaction
            const emailToFind = (fbUser && fbUser.email) || tx?.customer?.email || null
            if (emailToFind) {
              const q = query(collection(db, 'users'), where('email', '==', emailToFind))
              const snaps = await getDocs(q)
              if (!snaps.empty) {
                const found = snaps.docs[0]
                userRef = doc(db, 'users', found.id)
              }
            }
          }

          if (!userRef) {
            // no user to credit; navigate to dashboard anyway
            navigate('/dashboard')
            return
          }

          // idempotent processing: create a marker doc per Paystack reference and credit balance once
          try {
            const safeRefId = String(tx.reference || reference || '').replace(/[.#$/\[\]]+/g, '_') || String(reference).replace(/[.#$/\[\]]+/g, '_')
            const markerRef = doc(db, 'paystack_callbacks', safeRefId)

            await runTransaction(db, async (t) => {
              const markerSnap = await t.get(markerRef)
              if (markerSnap.exists()) {
                // already processed — stop further work
                throw new Error('ALREADY_PROCESSED')
              }

              const snap2 = await t.get(userRef)
              const current = Number(snap2.exists() ? (snap2.data().balance ?? snap2.data().wallet ?? 0) : 0)
              const newBalance = Number((current + creditAmount).toFixed(2))
              t.update(userRef, { balance: newBalance })
              t.set(markerRef, { reference: tx.reference || reference, userId: userRef.id, amount: creditAmount, rawAmount: amountGhs, metadata: tx.metadata || null, processedAt: serverTimestamp() })
            })

            // refresh auth context after credit
            const updatedSnap = await getDoc(userRef)
            const userDoc = updatedSnap.exists() ? updatedSnap.data() : {}
            const combined = fbUser && fbUser.uid ? { uid: fbUser.uid, email: fbUser.email, displayName: fbUser.displayName, ...userDoc } : userDoc
            try {
              if (typeof login === 'function') await login(combined)
            } catch (e) {
              console.warn('Failed to update auth context after payment', e)
            }

            // attempt automatic purchase if Paystack transaction included purchase metadata
            try {
              const meta = tx.metadata || {}
              const purchaseMeta = meta.purchase || null
              if (purchaseMeta) {
                const purchaseEndpoint = (typeof window !== 'undefined' && window.location && window.location.hostname && window.location.hostname.includes('localhost'))
                  ? '/.netlify/functions/purchase-proxy'
                  : (import.meta.env.VITE_API_PURCHASE || '/.netlify/functions/purchase-proxy')

                const payload = {
                  phoneNumber: purchaseMeta.phoneNumber || purchaseMeta.phone || '',
                  network: purchaseMeta.network || '',
                  capacity: purchaseMeta.capacity || purchaseMeta.size || purchaseMeta.bundle || '',
                  gateway: 'wallet'
                }

                const headers = { 'Content-Type': 'application/json' }
                if (import.meta.env.VITE_API_KEY) headers['X-API-Key'] = import.meta.env.VITE_API_KEY

                let purchaseResp = null
                try {
                  purchaseResp = await axios.post(purchaseEndpoint, payload, { headers })
                  console.log('Automatic purchase response', purchaseResp?.data)
                } catch (pErr) {
                  console.error('Automatic purchase failed', pErr)
                }

                // record purchase attempt/result on the marker doc so we don't run it again
                try {
                  await setDoc(markerRef, { purchaseExecuted: true, purchaseResponse: purchaseResp?.data || null, purchaseAttemptedAt: serverTimestamp() }, { merge: true })
                } catch (uErr) {
                  console.error('Failed to update paystack marker with purchase result', uErr)
                }

                // If purchase succeeded, save purchase record in Firestore and deduct the full bundle price
                try {
                  const resp = purchaseResp?.data || {}
                  const success = resp?.status === 'success' || resp?.success === true || resp?.order_status === 'success' || resp?.data?.status === 'success'
                  if (success) {
                    // determine display price: prefer metadata.displayPrice, fall back to response fields
                    const displayPrice = Number(purchaseMeta.displayPrice ?? purchaseMeta.display_price ?? resp?.displayPrice ?? resp?.data?.displayPrice ?? resp?.price ?? resp?.data?.price ?? 0) || 0

                    // create purchase doc and deduct balance atomically
                    const purchasesCol = collection(db, 'purchases')
                    const newPurchaseRef = doc(purchasesCol)

                    await runTransaction(db, async (tx) => {
                      const userSnap = await tx.get(userRef)
                      const current = Number(userSnap.exists() ? (userSnap.data().balance ?? userSnap.data().wallet ?? 0) : 0)
                      const newBal = Number(Math.max(0, (current - displayPrice)).toFixed(2))

                      tx.update(userRef, { balance: newBal })

                      const purchaseDoc = {
                        userId: userRef.id || (fbUser && fbUser.uid) || null,
                        network: purchaseMeta.network || '',
                        phoneNumber: purchaseMeta.phoneNumber || purchaseMeta.phone || '',
                        capacity: purchaseMeta.capacity || purchaseMeta.size || purchaseMeta.bundle || '',
                        price: Number(displayPrice) || 0,
                        displayPrice: Number(displayPrice) || 0,
                        transactionReference: resp?.transactionReference || resp?.transaction_ref || resp?.tx_ref || resp?.reference || resp?.data?.transactionReference || resp?.data?.reference || null,
                        rawResponse: resp,
                        createdAt: serverTimestamp(),
                        status: resp?.status || resp?.order_status || (resp?.data && resp.data.status) || 'success'
                      }

                      tx.set(newPurchaseRef, purchaseDoc)

                      // also update marker doc with reference to purchase doc id
                      tx.update(markerRef, { purchaseDocId: newPurchaseRef.id, purchaseSavedAt: serverTimestamp() })
                    })
                  }
                } catch (sErr) {
                  console.error('Failed to save purchase record or deduct balance after auto-purchase', sErr)
                }
              }
            } catch (autoErr) {
              console.error('Auto-purchase processing failed', autoErr)
            }

            navigate('/dashboard')
          } catch (err) {
            if (String(err.message || '').includes('ALREADY_PROCESSED')) {
              // nothing to do; another processor handled this reference
              navigate('/dashboard')
              return
            }
            console.error('Credit balance error', err)
            navigate('/dashboard')
          }
        } else {
          // payment not successful — navigate back to dashboard
          navigate('/dashboard')
        }
      } catch (err) {
        console.error('Verify+credit error', err)
        // on error, go back to dashboard
        navigate('/dashboard')
      }
    }

    verify()
  }, [searchParams, user, navigate, initializing])

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="w-full max-w-md px-4 text-center">
        <div className="mb-4 text-gray-600">Processing payment — verifying transaction, please wait...</div>
        <div className="flex items-center justify-center"><Spinner label="Verifying payment..." /></div>
      </div>
    </div>
  )
}

export default PaystackCallback
