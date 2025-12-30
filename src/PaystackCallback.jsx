import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { doc, getDoc, collection, query, where, getDocs, serverTimestamp, runTransaction } from 'firebase/firestore'
import { db } from './firebase'
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
        const resp = await fetch('/api/paystack/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference })
        })
        const body = await resp.json()
        if (!resp.ok) throw new Error(body.message || JSON.stringify(body))

        const tx = body?.data
        if (tx && tx.status === 'success') {
          const amountGhs = Number(tx.amount) / 100

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
              const newBalance = Number((current + amountGhs).toFixed(2))
              t.update(userRef, { balance: newBalance })
              t.set(markerRef, { reference: tx.reference || reference, userId: userRef.id, amount: amountGhs, processedAt: serverTimestamp() })
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

            // no automatic purchase after top-up; user should place orders manually
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
      <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" aria-hidden="true" />
    </div>
  )
}

export default PaystackCallback
