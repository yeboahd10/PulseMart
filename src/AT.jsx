import React from "react";
import  { useState, useEffect } from "react";
import axios from "axios";
import { addDoc, collection, serverTimestamp, runTransaction, doc as docRef } from 'firebase/firestore'
import { db } from './firebase'
import { useAuth } from './context/AuthContext'
import { FaCediSign, FaPhone, FaRegCopyright } from "react-icons/fa6";
import { TiTick } from 'react-icons/ti'
import { Link } from "react-router-dom";

// module-scope env and prices
const apiUrlAT = import.meta.env.VITE_API_BASE_AT_PREMIUM
const apiKey = import.meta.env.VITE_API_KEY
const purchaseUrl = import.meta.env.VITE_API_PURCHASE || 'https://api.datamartgh.shop/api/developer/purchase'
const localPricesAT = [4.15, 8.55, 13.45, 16.70, 19.70,23.70,30.70,38.70,45.70,57.70,95.20,115.20,151.20,190.20]

const AT = () => {
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [phone, setPhone] = useState("")
  const [bundles, setBundles] = useState(localPricesAT.map((p, i) => ({ network: 'AirtelTigo', dataAmount: `${i+1} GB`, price: p, apiPrice: null })))
  const [successModalOpen, setSuccessModalOpen] = useState(false)
  const [successInfo, setSuccessInfo] = useState(null)

  useEffect(() => {
    if (!apiUrlAT) return

    axios.get(apiUrlAT, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined })
      .then(res => {
        const raw = Array.isArray(res.data) ? res.data : res.data?.data || []
        console.log("AT API raw:", raw);
        const mapped = raw.map((item, i) => {
          const capacity =
            item.dataAmount ||
            item.amount ||
            item.size ||
            item.name ||
            item.label ||
            item.bundle ||
            item.description ||
            item.title ||
            item.capacity ||
            item.value ||
            `${i + 1} GB`;
          return {
            network: 'AirtelTigo',
            dataAmount: capacity,
            // display price (may use local fallback)
            price: localPricesAT[i] ?? item.price ?? null,
            // actual price from API for purchase
            apiPrice: item.price ?? null,
          }
        })
        if (mapped.length < localPricesAT.length) {
          for (let j = mapped.length; j < localPricesAT.length; j++) mapped.push({ network: 'AirtelTigo', dataAmount: `${j+1} GB`, price: localPricesAT[j], apiPrice: null })
        }
        setBundles(mapped)
      })
      .catch(err => {
        console.error('AT fetch error', err)
        setBundles(localPricesAT.map((p, i) => ({ network: 'AirtelTigo', dataAmount: `${i+1} GB`, price: p })))
      })
  }, [])

  const handleBuy = () => {
    const b = bundles[selectedIndex]
    if (!b) return
    if (!phone) {
      alert('Please enter a phone number')
      return
    }
    if (!purchaseUrl) {
      alert('Purchase URL not configured')
      return
    }

    const actualPrice = b.apiPrice ?? null
    if (!actualPrice) {
      alert('Cannot purchase: price not available from API for this bundle')
      return
    }

    const mapNetwork = (net) => {
      if (!net) return net
      const n = String(net).toLowerCase()
      if (n.includes('mtn') || n.includes('yello')) return 'YELLO'
      if (n.includes('telecel')) return 'TELECEL'
      if (n.includes('airteltigo') || n.includes('airtel') || n.includes('at')) return 'AT_PREMIUM'
      return String(net).toUpperCase()
    }

    const capacity = String((b.dataAmount || '').replace(/[^0-9]/g, '')) || String(b.capacity || '')

    const payload = {
      phoneNumber: phone,
      network: mapNetwork(b.network),
      capacity: capacity,
      gateway: 'wallet'
    };

    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['X-API-Key'] = apiKey

    axios.post('/api/purchase', payload, { headers })
      .then(async (res) => {
        console.log('AT purchase resp:', res.data)
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
              price: actualPrice,
              createdAt: serverTimestamp(),
            })

            // deduct UI display price from user's balance
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
            console.error('Failed saving AT purchase or updating balance in Firestore', err)
          }
        } else {
          alert('Purchase request submitted but not successful — check response')
        }
        setModalOpen(false)
      })
      .catch(err => {
        console.error('AT purchase error', err)
        alert('Purchase failed')
      })
  }

  return (
    <div>
      <div className="flex justify-center flex-col text-center items-center">
        <h2 className="text-3xl font-bold m-3">AT Data Bundles</h2>
        <p className="mx-2">AirtelTigo bundles at great value.</p>
      </div>

      <div className="flex justify-center flex-col text-center items-center ">
        <div className="w-full max-w-4xl px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            {bundles.map((b, idx) => (
              <div
                key={idx}
                onClick={() => { setSelectedIndex(idx); setModalOpen(true) }}
                className="card bg-base-100 shadow-sm hover:shadow-lg transition-shadow duration-200 overflow-hidden relative h-36 cursor-pointer"
              >
                <div className="absolute top-0 left-0 w-full h-36 bg-blue-500" />

                <div className="absolute top-0 left-0 w-full h-32 flex items-center justify-center z-10">
                  <div className="flex items-center justify-center gap-4 px-4">
                    <div className="text-center">
                      <h2 className="card-title text-3xl text-white font-bold">{b.dataAmount}</h2>
                    </div>

                    <div className="w-px bg-black h-12" />

                    <div className="text-center">
                      <div className="text-3xl text-white font-semibold">
                        <FaCediSign className="inline mr-1" />{b.price}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {modalOpen && bundles[selectedIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg w-11/12 max-w-md p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">Confirm Purchase</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-gray-800">✕</button>
            </div>

            <div className="mb-4">
              <div className="text-sm text-gray-600">Network</div>
              <div className="text-xl font-bold">{bundles[selectedIndex].network}</div>
            </div>

            <div className="mb-4">
              <div className="text-sm text-gray-600">Data Amount</div>
              <div className="text-xl font-bold">{bundles[selectedIndex].dataAmount}</div>
            </div>

            <div className="mb-4">
              <div className="text-sm text-gray-600">Price</div>
              <div className="text-xl font-semibold"><FaCediSign className="inline mr-1"/>{bundles[selectedIndex].price}</div>
            </div>

           

            <div className="mb-4">
              <label className="label">Phone Number</label>
              <input
                type="text"
                placeholder="Enter phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input w-full"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleBuy} className="btn btn-primary">Buy</button>
            </div>
          </div>
        </div>
      )}

          {successModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                  <div className="bg-white rounded-lg shadow-lg w-11/12 max-w-md p-6">
                    <div className="flex justify-end">
                      <button
                        onClick={() => setSuccessModalOpen(false)}
                        className="text-gray-500 hover:text-gray-800"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="py-6 flex flex-col items-center justify-center text-center gap-3">
                      <div className="rounded-full bg-green-100 p-4">
                        <TiTick className="text-green-600" size={48} />
                      </div>
                      <div className="text-lg font-medium">Order placed successfully</div>
                      {successInfo?.purchaseId && (
                        <div className="text-sm text-gray-600 mt-1">Order ID: {successInfo.purchaseId}</div>
                      )}
                    </div>
                    <div className="flex justify-center">
                      <button
                        onClick={() => setSuccessModalOpen(false)}
                        className="btn btn-primary"
                      >
                        OK
                      </button>
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

export default AT
