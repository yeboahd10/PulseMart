import React from "react";
import  { useState } from "react";
import axios from "axios";
import usePackages from './hooks/usePackages'
import Spinner from './components/Spinner'
import SkeletonGrid from './components/SkeletonGrid'
import BundleCard from './components/BundleCard'
import { addDoc, collection, serverTimestamp, runTransaction, doc as docRef } from 'firebase/firestore'
import { db } from './firebase'
import { useAuth } from './context/AuthContext'
import { FaCediSign, FaPhone, FaRegCopyright } from "react-icons/fa6";
import { mapNetwork } from './utils/network'
import { TiTick } from 'react-icons/ti'
import { Link } from "react-router-dom";

// module-scope env and prices for Telecel
const apiUrlTelecel = import.meta.env.VITE_API_BASE_TELECEL
const apiKey = import.meta.env.VITE_API_KEY
const purchaseUrl = (typeof window !== 'undefined' && window.location && window.location.hostname && window.location.hostname.includes('localhost'))
  ? '/.netlify/functions/purchase-proxy'
  : (import.meta.env.VITE_API_PURCHASE || '/.netlify/functions/purchase-proxy')
const localPricesTelecel = [25, 40, 48, 55, 68,85,100,120,137,157,174,195,360]

const Telecel = () => {
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [phone, setPhone] = useState("")
  const { bundles, setBundles, loading, error } = usePackages('Telecel', localPricesTelecel)
  const [successModalOpen, setSuccessModalOpen] = useState(false)
  const [successInfo, setSuccessInfo] = useState(null)

  

  const handleBuy = async () => {
    if (!bundles[selectedIndex]) return
    const b = bundles[selectedIndex]
    if (!phone) {
      alert('Please enter a phone number')
      return
    }
    if (!purchaseUrl) {
      alert('Purchase URL not configured')
      return
    }

    const displayPrice = Number(b.price) || 0
    const userBalance = Number(user?.balance ?? user?.wallet ?? 0)
    if (user && userBalance < displayPrice) {
      const shortfall = Number((displayPrice - userBalance).toFixed(2))
      const fee = Number((shortfall * 0.02).toFixed(2))
      const total = Number((shortfall + fee).toFixed(2))
      if (!user.email) {
        alert('Please ensure your account has an email before paying')
        return
      }

      const capacity = String((b.dataAmount || '').replace(/[^0-9]/g, '')) || String(b.capacity || '')
      const initPayload = {
        amount: total,
        email: user.email,
        callback_url: `${window.location.origin}/paystack/callback`,
        metadata: {
          purchase: {
            phoneNumber: phone,
            network: mapNetwork(b.network || 'Telecel'),
            capacity: capacity,
            displayPrice: displayPrice,
            shortfall,
            fee
          }
        }
      }

      try {
        const { initPaystack } = await import('./utils/paystack')
        await initPaystack(initPayload)
      } catch (err) {
        alert(`Payment initialization failed: ${err.response?.data?.message || err.message}`)
      }

      return
    }
    const actualPrice = b.apiPrice ?? null
    if (!actualPrice) {
      alert('Cannot purchase: price not available from API for this bundle')
      return
    }

    const capacity = String((b.dataAmount || '').replace(/[^0-9]/g, '')) || String(b.capacity || '')
    const payload = { phoneNumber: phone, network: mapNetwork(b.network || 'Telecel'), capacity, gateway: 'wallet' }
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['X-API-Key'] = apiKey
    axios.post(purchaseUrl, payload, { headers })
      .then(async (res) => {
        console.log('Telecel purchase resp:', res.data)
        const resp = res.data || {}
        const success = resp?.status === 'success' || resp?.success === true || resp?.order_status === 'success' || resp?.data?.status === 'success'
        if (success) {
          const purchaseId = resp?.purchaseId || resp?.id || resp?.data?.id || resp?.transactionId || resp?.txId || null
          const transactionReference = resp?.transactionReference || resp?.transaction_ref || resp?.tx_ref || resp?.reference || resp?.data?.transactionReference || null
          setSuccessInfo({ purchaseId, transactionReference })
          setSuccessModalOpen(true)
          try {
            // save purchase
            await addDoc(collection(db, 'purchases'), {
              userId: user?.uid ?? null,
              purchaseId,
              transactionReference: transactionReference || purchaseId || resp?.data?.reference || resp?.data?.transactionReference || resp?.data?.id || '',
              rawResponse: resp,
              network: b.network,
              phoneNumber: phone,
              capacity: b.dataAmount,
              // include local/display price fields so Dashboard shows UI prices
              price: actualPrice,
              displayPrice: Number(b.price) || 0,
              display_price: Number(b.price) || 0,
              localPrice: Number(b.price) || 0,
              createdAt: serverTimestamp(),
            })

            // deduct display price from user's balance in Firestore
            if (user?.uid) {
              const userDocRef = docRef(db, 'users', user.uid)
              const displayPrice = Number(b.price) || 0
              await runTransaction(db, async (tx) => {
                const snap = await tx.get(userDocRef)
                const current = Number(snap.exists() ? (snap.data().balance ?? snap.data().wallet ?? 0) : 0)
                if (current < displayPrice) {
                  throw new Error('Insufficient balance')
                }
                const newBal = current - displayPrice
                tx.update(userDocRef, { balance: newBal })
              })
            }
          } catch (err) {
            console.error('Failed saving Telecel purchase or updating balance in Firestore', err)
          }
        } else {
          alert('Purchase request submitted but not successful — check response')
        }
        setModalOpen(false)
      })
      .catch(err => {
        console.error('Telecel purchase error', err)
        alert('Purchase failed')
      })
  }

  if (loading) {
    return (
      <div className="py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-center mb-6"><Spinner label="Loading bundles..." /></div>
          <SkeletonGrid columns={3} count={6} />
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-center flex-col text-center items-center">
        <h2 className="text-3xl font-bold m-3">Telecel Data Bundles</h2>
        <p className="mx-2">Affordable Telecel plans delivered instantly.</p>
      </div>

      <div className="flex justify-center flex-col text-center items-center ">
        <div className="w-full max-w-4xl px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            {bundles.map((b, idx) => (
              <div key={idx} onClick={() => { setSelectedIndex(idx); setModalOpen(true) }}>
                <BundleCard b={b} onClick={() => { setSelectedIndex(idx); setModalOpen(true) }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {modalOpen && bundles[selectedIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="backdrop-blur-sm bg-white/60 border border-white/30 rounded-2xl shadow-2xl w-11/12 max-w-md">
            <div className="px-5 py-4 border-b border-white/30 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Confirm Purchase</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-700 hover:text-gray-900">✕</button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500">Network</span>
                <span className="text-sm font-medium text-gray-900">{bundles[selectedIndex].network}</span>
              </div>

              <div className="flex flex-col">
                <span className="text-xs text-gray-500">Data Amount</span>
                <span className="text-sm font-medium text-gray-900">{bundles[selectedIndex].dataAmount}</span>
              </div>

              <div className="flex flex-col">
                <span className="text-xs text-gray-500">Price</span>
                <div className="flex items-center gap-1 text-lg font-bold text-gray-900">
                  <FaCediSign />{bundles[selectedIndex].price}
                </div>
              </div>

              <div className="flex flex-col">
                <label className="text-xs text-gray-500 mb-1">Phone Number</label>
                <input
                  type="text"
                  placeholder="Enter phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50">Cancel</button>
                <button onClick={handleBuy} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Place Order</button>
              </div>
            </div>
          </div>
        </div>
      )}
    
      {successModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="backdrop-blur-sm bg-white/60 border border-white/30 rounded-2xl shadow-2xl w-11/12 max-w-sm p-6 text-center">
            <button onClick={() => setSuccessModalOpen(false)} className="absolute right-4 top-4 text-gray-700">✕</button>
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-full bg-green-100 p-4">
                <TiTick className="text-green-600" size={40} />
              </div>
              <div className="text-lg font-semibold text-gray-900">Order placed successfully</div>
              {successInfo?.purchaseId && (
                <div className="text-sm text-gray-600">Order ID: {successInfo.purchaseId}</div>
              )}
              <div className="w-full">
                <button onClick={() => setSuccessModalOpen(false)} className="w-full mt-3 px-4 py-2 rounded-lg bg-blue-600 text-white">OK</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="flex mb-4 mt-8 text-center justify-center items-center gap-2 text-gray-500">
         <p><FaRegCopyright className="inline-block" /> 2025 PulseMart. All rights reserved.</p>

      </div>
    </div>
  )
}

export default Telecel
