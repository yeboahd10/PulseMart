import React, { useState, useEffect } from "react";
import { useAuth } from "./context/AuthContext";
import { FaWallet, FaChevronLeft, FaChevronRight, FaList } from "react-icons/fa";
import { CgProfile } from "react-icons/cg";
import { FaCartPlus } from "react-icons/fa";
import { FaCediSign } from "react-icons/fa6";
import { Link } from "react-router-dom";
import { doc, setDoc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore'
import { db, auth } from './firebase'
import { updateProfile } from 'firebase/auth'
import PaymentModal from './components/PaymentModal'

const Dashboard = () => {
  const { user } = useAuth();
  const [selected, setSelected] = useState("wallet");
  const [profileFullName, setProfileFullName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileUID, setProfileUID] = useState('')
  const [profileReferral, setProfileReferral] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')
  const [showPayModal, setShowPayModal] = useState(false)
  const [availableBalance, setAvailableBalance] = useState(null)
  const [orders, setOrders] = useState([])
  const [filterQuery, setFilterQuery] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showAllOrders, setShowAllOrders] = useState(false)

  useEffect(() => {
    if (!user) return
    setProfileFullName(user.fullName ?? user.displayName ?? '')
    setProfileEmail(user.email ?? '')
    setProfilePhone(user.phone ?? '')
    setProfileUID(user.uid ?? '')
    setProfileReferral(user.referralCode ?? '')
    // listen for balance changes in Firestore
    let unsub
    try {
      const userRef = doc(db, 'users', user.uid)
      unsub = onSnapshot(userRef, (snap) => {
        const data = snap.exists() ? snap.data() : {}
        const bal = Number(data.balance ?? data.wallet ?? 0)
        setAvailableBalance(bal)
      }, (err) => {
        console.error('Balance snapshot error', err)
      })
    } catch (e) {
      console.error('Balance listener setup failed', e)
    }

    return () => { if (typeof unsub === 'function') unsub() }
  }, [user])

  const items = [
    { id: "wallet", icon: <FaWallet size="1.5em" />, label: "Wallet" },
    {
      id: "orders",
      icon: <FaCartPlus size="1.5em" />,
      label: "Orders",
      badge: orders.length || undefined,
    },
    { id: "profile", icon: <CgProfile size="1.5em" />, label: "Profile" },
  ];

  useEffect(() => {
    if (!user?.uid) { setOrders([]); return }
    try {
      const purchasesRef = collection(db, 'purchases')

      const mapSnap = (snap) => snap.docs.map(d => {
        const data = d.data() || {}
        return {
          id: d.id,
          networkNumber: `${data.network || ''} • ${data.phoneNumber || data.phone || ''}`.trim(),
          phoneNumber: data.phoneNumber || data.phone || data.msisdn || '',
          dataAmount: data.capacity || data.size || data.bundle || '',
          price: ((Number(data.price ?? data.amount) || 0)).toFixed(2),
          transactionId: data.transactionReference || data.transaction_ref || data.tx_ref || data.reference || data.transactionId || data.txId || data.id || '',
          status: (data.status || data.order_status || data.tx_status || 'Unknown'),
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : null,
          raw: data
        }
      })

      const subscribe = (q) => onSnapshot(q, (snap) => {
        let items = mapSnap(snap)
        // ensure latest-first ordering client-side as well
        items = items.sort((a,b) => {
          const ta = a.createdAt ? a.createdAt.getTime() : 0
          const tb = b.createdAt ? b.createdAt.getTime() : 0
          return tb - ta
        })
        setOrders(items)
      }, (err) => {
        console.error('Purchases snapshot error', err)
        // if Firestore indicates a missing index, retry with a where-only query
        const msg = String(err?.message || '').toLowerCase()
        if (msg.includes('index') || msg.includes('composite index') || msg.includes('requires an index')) {
          try {
            const fallbackQ = query(purchasesRef, where('userId', '==', user.uid))
            const unsubFallback = onSnapshot(fallbackQ, (snap) => {
              let items = mapSnap(snap)
              items = items.sort((a,b) => {
                const ta = a.createdAt ? a.createdAt.getTime() : 0
                const tb = b.createdAt ? b.createdAt.getTime() : 0
                return tb - ta
              })
              setOrders(items)
            }, (err2) => console.error('Purchases fallback snapshot error', err2))
            // return fallback unsub when original subscribes fails
            return unsubFallback
          } catch (e) {
            console.error('Failed to subscribe fallback purchases query', e)
          }
        }
      })

      // try primary ordered query first
      const q = query(purchasesRef, where('userId', '==', user.uid), orderBy('createdAt', 'desc'))
      const unsub = subscribe(q)
      return () => unsub()
    } catch (e) {
      console.error('Failed to subscribe to purchases', e)
      setOrders([])
    }
  }, [user])

  // reset pagination when orders change
  useEffect(() => {
    setCurrentPage(1)
    setShowAllOrders(false)
  }, [orders.length])

  const hasChanges = () => {
    if (!user) return false
    const originalName = user.fullName ?? user.displayName ?? ''
    const originalPhone = user.phone ?? ''
    return (String(profileFullName || '') !== String(originalName || '')) || (String(profilePhone || '') !== String(originalPhone || ''))
  }

  // helper to truncate long transaction ids
  const truncate = (tx = '') => {
    const s = String(tx || '')
    if (s.length <= 18) return s
    return `${s.slice(0, 8)}...${s.slice(-6)}`
  }

  return (
    <div>
      <div className="flex m-3 p-2 flex-col">
        <h3 className="font-bold text-3xl">Dashboard</h3>
        <p className="mt-2">
          Welcome back, {user?.fullName || user?.displayName || user?.email || "Guest"}
        </p>
      </div>

      <div className="mb-8">
        <ul className="list bg-base-100 rounded-box shadow-md p-2 m-3">
          {items.map((it) => {
            const isSelected = selected === it.id;
            const liClasses = `list-row justify-center items-center px-3 py-2 cursor-pointer rounded-md transition-colors duration-150 ${
              isSelected ? "bg-blue-500 text-white" : ""
            }`;

            return (
              <li
                key={it.id}
                className={liClasses}
                onClick={() => setSelected(it.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) =>
                  e.key === "Enter" ? setSelected(it.id) : null
                }
              >
                <div className="mr-3">
                  {React.cloneElement(it.icon, {
                    color: isSelected ? "#fff" : undefined,
                  })}
                </div>
                <div className="flex-1">
                  <div className="text-lg">{it.label}</div>
                </div>
                {it.badge ? (
                  <div
                    className={`w-8 h-8 flex items-center justify-center rounded-full font-semibold text-sm ${
                      isSelected
                        ? "bg-white text-red-500"
                        : "bg-blue-500 text-white"
                    }`}
                  >
                    {it.badge}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        {selected === "wallet" && (
          <div>
            <div className="m-3 p-5  rounded-box shadow-md bg-blue-500 text-white ">
              <div className="flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <p className="">Available Balance</p>
                    <h2 className="text-4xl font-bold">
                      <FaCediSign size={30} className="inline mr-1 " />
                      {(Number(availableBalance || 0)).toFixed(2)}
                    </h2>
                  </div>
                  <div>
                    <FaWallet size="3em" className="ml-10 text-white  " />
                  </div>
                </div>

                <hr />
                <div className="text-center mt-2">
                  <p>Your balance is availble for use</p>
                </div>

                <div>
                  <button
                    className="btn btn-outline btn-light mt-5 w-full text-white border-white hover:bg-white hover:text-red-500"
                    onClick={() => setShowPayModal(true)}
                  >
                    Add Funds
                  </button>
                </div>
                 <div className="text-center  rounded-xl mt-2 justify-center items-center">
                  <p className="text-sm mt-3">Payment is secured by Paystack</p>
                 </div>
              </div>
            </div>
            <div className="flex justify-center items-center">
              <Link to="/"><button className="btn btn-primary m-3 w-full hover:bg-white hover:text-blue-500">Buy Bundle Now</button></Link>
            </div>
            <PaymentModal
              open={showPayModal}
              onClose={() => setShowPayModal(false)}
              defaultEmail={profileEmail}
              onSubmit={async (amount) => {
                try {
                  const amt = parseFloat(amount)
                  if (isNaN(amt) || amt <= 0) { alert('Please enter a valid amount'); return }

                  const payload = { amount: amt, email: profileEmail, callback_url: `${window.location.origin}/paystack/callback` }
                  let body = null
                  // first try Netlify function endpoint
                  try {
                    const resp = await fetch('/.netlify/functions/paystack-initialize', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload)
                    })

                    if (!resp.ok) {
                      let text = ''
                      try { text = await resp.text(); const maybeJson = JSON.parse(text || '{}'); throw new Error(maybeJson.message || JSON.stringify(maybeJson) || resp.statusText) } catch (e) { throw new Error(text || resp.statusText || `HTTP ${resp.status}`) }
                    }

                    body = await resp.json()
                  } catch (netlifyErr) {
                    // fallback to local express server if Netlify functions aren't available
                    try {
                      const fallbackResp = await fetch('http://localhost:5000/api/paystack/initialize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                      })
                      if (!fallbackResp.ok) {
                        let text = ''
                        try { text = await fallbackResp.text(); const maybeJson = JSON.parse(text || '{}'); throw new Error(maybeJson.message || JSON.stringify(maybeJson) || fallbackResp.statusText) } catch (e) { throw new Error(text || fallbackResp.statusText || `HTTP ${fallbackResp.status}`) }
                      }
                      body = await fallbackResp.json()
                    } catch (fallbackErr) {
                      // rethrow original error for outer catch to handle
                      throw netlifyErr
                    }
                  }

                  const url = body?.data?.authorization_url
                  if (url) {
                    setShowPayModal(false)
                    window.location.href = url
                  } else {
                    alert('Payment initialization failed')
                  }
                } catch (err) {
                  console.error('Paystack init error', err)
                  alert('Failed to initialize payment: ' + (err.message || err))
                }
              }}
            />
          </div>
        )}
        {selected === "orders" && (
          <div className="m-3 p-2 bg-base-100 rounded-box shadow-md">
            <h3 className="font-semibold mb-3 text-2xl">My Orders</h3>

            <div className="flex items-center justify-between mb-3">
              <div className="w-full max-w-md">
                <input
                  type="search"
                  placeholder="Search by phone or transaction ID"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="input input-bordered w-full"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              {
                /* compute filtered orders */
              }
              
              
              <table className="table w-full min-w-160 border-collapse">
                <thead>
                  <tr className="border-b-2 border-black-light-50">
                    <th className="text-left font-bold text-black">Network</th>
                    <th className="text-left text-black">Phone</th>
                    <th className="text-left text-black">Data Amount</th>
                    <th className="text-left text-black">Price (¢)</th>
                    <th className="text-left text-black">Transaction ID</th>
                    <th className="text-left text-black">Date & Time</th>
                  </tr>
                </thead>
                <tbody>
                  {/* pagination: show only current page (page size = 1) unless showAllOrders is true */}
                  {(() => {
                    const q = String(filterQuery || '').trim().toLowerCase()
                    const filtered = orders.filter((o) => {
                      if (!q) return true
                      return (String(o.phoneNumber || '').toLowerCase().includes(q) || String(o.transactionId || '').toLowerCase().includes(q))
                    })
                    if (filtered.length === 0) return (<tr><td colSpan={6} className="text-center py-6">No orders yet</td></tr>)

                    const pageSize = 1
                    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
                    const page = Math.min(Math.max(1, currentPage), totalPages)
                    const pageItems = showAllOrders ? filtered : filtered.slice((page-1)*pageSize, page*pageSize)

                    return pageItems.map((o) => (
                      <tr key={o.id} className="border-b-2 border-gray-300">
                        <td>{o.networkNumber}</td>
                        <td className="font-mono text-sm">{o.phoneNumber}</td>
                        <td>{o.dataAmount}</td>
                        <td>
                          <FaCediSign className="inline mr-1" />
                          {o.price}
                        </td>
                        <td className="break-all text-sm text-gray-700 flex items-center gap-2">
                          <span className="font-mono">
                            {truncate(o.transactionId)}
                          </span>
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(o.transactionId || '')
                                setCopiedId(o.id)
                                setTimeout(() => setCopiedId(null), 1500)
                              } catch (err) {
                                console.error('Copy failed', err)
                              }
                            }}
                            className="btn btn-xs btn-ghost"
                            title="Copy transaction id"
                          >
                            {copiedId === o.id ? 'Copied' : 'Copy'}
                          </button>
                        </td>
                        <td>
                          {o.createdAt && <div className="text-xs text-gray-400 mt-1">{o.createdAt.toLocaleString()}</div>}
                        </td>
                      </tr>
                    ))
                  })()}
                </tbody>
              </table>

              {/* pagination controls */}
              <div className="flex items-center justify-between mt-3">
                <div>
                  {orders.length > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => setShowAllOrders(!showAllOrders)}
                        title={showAllOrders ? 'Show latest only' : 'View all orders'}
                      >
                        <FaList />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!showAllOrders && orders.length > 1 && (
                    <>
                      <button className="btn btn-sm btn-ghost" onClick={() => setCurrentPage((p) => Math.max(1, p-1))} disabled={currentPage <= 1}><FaChevronLeft /></button>
                      <div className="text-sm text-gray-600">{Math.min(currentPage, Math.max(1, orders.length))}/{Math.max(1, orders.length)}</div>
                      <button className="btn btn-sm btn-ghost" onClick={() => setCurrentPage((p) => Math.min(Math.max(1, orders.length), p+1))} disabled={currentPage >= Math.max(1, orders.length)}><FaChevronRight /></button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {selected === "profile" && (
          <div className="m-3 p-4 bg-base-100 rounded-box shadow-md">
            <div>
              <h2 className="text-xl font-semibold mb-4">
                Personal Information
              </h2>
            </div>
            <div>
              <div className="relative flex flex-col">
                <label className="label">Full Name</label>
                <input
                  type="text"
                  className="input h-12 pl-1 w-80"
                  value={profileFullName}
                  onChange={(e) => setProfileFullName(e.target.value)}
                />
              </div>
              <div className="relative flex flex-col">
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input h-12 pl-1 w-80"
                  value={profileEmail}
                  readOnly
                  disabled
                />
              </div>
              <div className="relative flex flex-col">
                <label className="label">Phone Number </label>
                <input
                  type="text"
                  className="input h-12 pl-1 w-80"
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                />
              </div>
              <div className="relative flex flex-col">
                <label className="label">UserID</label>
                <input
                  type="text"
                  className="input h-12 pl-1 w-80"
                  value={profileUID}
                  readOnly
                  disabled
                />
              </div>
              <div className="relative flex flex-col">
                <label className="label">Referral Code</label>
                <input
                  type="text"
                  className="input h-12 pl-1 w-80"
                  value={profileReferral}
                  readOnly
                  disabled
                />
              </div>
              <div>
                <button
                  className="btn btn-primary mt-5 w-80"
                  disabled={savingProfile || !hasChanges()}
                  onClick={async () => {
                    if (!user?.uid) { setProfileMsg('Not signed in'); return }
                    if (!hasChanges()) { setProfileMsg('No changes to save'); setTimeout(() => setProfileMsg(''), 2000); return }
                    setSavingProfile(true)
                    try {
                      const updates = {}
                      const originalName = user.fullName ?? user.displayName ?? ''
                      const originalPhone = user.phone ?? ''
                      if (String(profileFullName || '') !== String(originalName || '')) updates.fullName = profileFullName
                      if (String(profilePhone || '') !== String(originalPhone || '')) updates.phone = profilePhone

                      if (Object.keys(updates).length === 0) {
                        setProfileMsg('No changes to save')
                        return
                      }

                      await setDoc(doc(db, 'users', user.uid), updates, { merge: true })

                      // try updating Firebase Auth displayName when name changed
                      if (updates.fullName && auth?.currentUser) {
                        try {
                          await updateProfile(auth.currentUser, { displayName: updates.fullName })
                        } catch (e) {
                          console.warn('Failed to update auth displayName', e)
                        }
                      }

                      setProfileMsg('Profile saved')
                    } catch (err) {
                      console.error('Failed to save profile', err)
                      setProfileMsg('Save failed')
                    } finally {
                      setSavingProfile(false)
                      setTimeout(() => setProfileMsg(''), 3000)
                    }
                  }}
                >{savingProfile ? 'Saving...' : 'Save Changes'}</button>
                {profileMsg && <p className="text-sm mt-2">{profileMsg}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
