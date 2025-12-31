import React, { useState, useEffect } from "react";
import axios from "axios";
import { addDoc, collection, serverTimestamp, runTransaction, doc as docRef } from 'firebase/firestore'
import { db } from './firebase'
import { useAuth } from './context/AuthContext'
import { TiTick } from "react-icons/ti";
import { FaCediSign, FaPhone, FaRegCopyright } from "react-icons/fa6";
import { Link } from "react-router-dom";

const apiUrl = import.meta.env.VITE_API_BASE ;
const PurchaseapiUrl = import.meta.env.VITE_API_PURCHASE ;
const apiKey = import.meta.env.VITE_API_KEY;
const purchaseUrl = import.meta.env.VITE_API_PURCHASE || 'https://api.datamartgh.shop/api/developer/purchase';

const localPrices = [4.7, 9.4, 13.7, 18.5, 23.5, 27.2,35.5,44,62.5,83,105,129,166,207,407];
const MTN = () => {
  const { user } = useAuth()
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [phone, setPhone] = useState("");
  const [bundles, setBundles] = useState(localPrices.map((p, i) => ({ network: 'MTN', dataAmount: `${i + 1} GB`, price: p, apiPrice: null })));
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [successInfo, setSuccessInfo] = useState(null);

  useEffect(() => {
    if (!apiUrl) {
      console.error("API URL is missing in .env");
      return;
    }
    axios
      .get('/.netlify/functions/packages?provider=MTN')
      .then((response) => {
        const raw = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];
        console.log("MTN API raw:", raw);

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
            network: "MTN",
            dataAmount: capacity,
            // UI display price (keeps local price for display)
            price: localPrices[i] ?? item.price ?? null,
            // actual price from API — used for purchases only
            apiPrice: item.price ?? null,
          };
        });

        if (mapped.length < localPrices.length) {
          for (let j = mapped.length; j < localPrices.length; j++) {
            mapped.push({
              network: "MTN",
              dataAmount: `${j + 1} GB`,
              price: localPrices[j],
              apiPrice: null,
            });
          }
        }

        setBundles(mapped);
      })
      .catch((error) => {
        console.error("Error fetching MTN data packages:", error);

        setBundles(
          localPrices.map((p, i) => ({
            network: "MTN",
            dataAmount: `${i + 1} GB`,
            price: p,
            apiPrice: null,
          }))
        );
      });
  }, []);

  const handleBuy = () => {
    const b = bundles[selectedIndex];
    if (!b) return;
    if (!phone) {
      alert('Please enter a phone number');
      return;
    }
    if (!purchaseUrl) {
      alert('Purchase URL not configured');
      return;
    }

    const displayPrice = Number(b.price) || 0
    const userBalance = Number(user?.balance ?? user?.wallet ?? 0)

    // if user's balance is less than local display price, trigger Paystack
    if (user && userBalance < displayPrice) {
      const shortfall = Number((displayPrice - userBalance).toFixed(2))
      if (!user.email) {
        alert('Please ensure your account has an email before paying');
        return
      }

      const capacity = String((b.dataAmount || '').replace(/[^0-9]/g, '')) || String(b.capacity || '')
      const mapNetwork = (net) => {
        if (!net) return net
        const n = String(net).toLowerCase()
        if (n.includes('mtn') || n.includes('yello')) return 'YELLO'
        if (n.includes('telecel')) return 'TELECEL'
        if (n.includes('airteltigo') || n.includes('airtel') || n.includes('at')) return 'AT_PREMIUM'
        return String(net).toUpperCase()
      }

      // initialize Paystack payment for the shortfall and include purchase metadata
      const initPayload = {
        amount: shortfall,
        email: user.email,
        callback_url: `${window.location.origin}/paystack/callback`,
        metadata: {
          purchase: {
            phoneNumber: phone,
            network: mapNetwork(b.network),
            capacity: capacity,
            displayPrice: displayPrice
          }
        }
      }

      ;(async () => {
        try {
          const res = await axios.post('/.netlify/functions/paystack-initialize', initPayload)
          const data = res.data && (res.data.data || res.data)
          const url = data?.authorization_url || data?.authorizationUrl || data?.data?.authorization_url
          if (!url) throw new Error('No authorization URL returned from Paystack')
          window.location.href = url
        } catch (netlifyErr) {
          console.warn('Netlify init failed, falling back to local server', netlifyErr)
          try {
            const res2 = await axios.post('http://localhost:5000/api/paystack/initialize', initPayload)
            const data = res2.data && (res2.data.data || res2.data)
            const url = data?.authorization_url || data?.authorizationUrl || data?.data?.authorization_url
            if (!url) throw new Error('No authorization URL returned from Paystack (fallback)')
            window.location.href = url
          } catch (fallbackErr) {
            console.error('Paystack init error', fallbackErr)
            alert(`Payment initialization failed: ${fallbackErr.response?.data?.message || fallbackErr.message}`)
          }
        }
      })()

      return
    }

    // require API price for purchase (only after wallet/Paystack handling)
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

    axios.post(purchaseUrl, payload, { headers })
      .then(async (res) => {
        console.log('Purchase response:', res.data);
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

            // deduct local display price from user's balance in Firestore (atomic)
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
            console.error('Failed saving purchase or updating balance in Firestore', err)
          }
        } else {
          alert('Purchase request submitted but not successful — check response')
        }
        setModalOpen(false)
      })
      .catch((err) => {
        console.error('Purchase error:', err);
        alert(`Purchase failed: ${err.response?.data?.message || err.message}`);
      });
  };

  return (
    <div>
      <div className="flex justify-center flex-col text-center items-center">
        <h2 className="text-3xl font-bold m-3">MTN Data Bundles</h2>
        <p className="mx-2">
          Choose from a variety of affordable MTN data plans to stay connected.
        </p>
      </div>
      <div className="flex justify-center flex-col text-center items-center ">
        <div className="w-full max-w-4xl px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            {bundles.map((b, idx) => (
              <div
                key={idx}
                onClick={() => {
                  setSelectedIndex(idx);
                  setModalOpen(true);
                }}
                className="card bg-base-100 shadow-sm hover:shadow-lg transition-shadow duration-200 overflow-hidden relative h-36 cursor-pointer"
              >
                <div className="absolute top-0 left-0 w-full h-36 bg-amber-300" />

                <div className="absolute top-0 left-0 w-full h-32 flex items-center justify-center z-10">
                  <div className="flex items-center justify-between gap-4 px-6 w-full">
                    <div className="text-left">
                      <div className="text-3xl font-semibold">
                        <h2 className="card-title text-3xl font-bold">
                          {b.dataAmount} GB
                        </h2>
                      </div>
                    </div>

                    <div className="w-px bg-black h-12" />

                    <div className="text-right text-3xl font-semibold mr-8">
                      <FaCediSign className="inline mr-1" />
                      {b.price}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-lg w-11/12 max-w-md p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">Confirm Purchase</h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>

            <div className="mb-4">
              <div className="text-sm text-gray-600">Network</div>
              <div className="text-xl font-bold">
                {bundles[selectedIndex].network}
              </div>
            </div>

            <div className="mb-4">
              <div className="text-sm text-gray-600">Data Amount</div>
              <div className="text-xl font-bold">
                {bundles[selectedIndex].dataAmount}
              </div>
            </div>

            <div className="mb-4">
              <div className="text-sm text-gray-600">Price</div>
              <div className="text-xl font-semibold">
                <FaCediSign className="inline mr-1" />
                {bundles[selectedIndex].price}
              </div>
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
              <button
                onClick={() => setModalOpen(false)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button onClick={handleBuy} className="btn btn-primary">
                Place Order
              </button>
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
        <p>
          <FaRegCopyright className="inline-block" /> 2025 PulseMart. All rights
          reserved.
        </p>
      </div>
    </div>
  );
};

export default MTN;
