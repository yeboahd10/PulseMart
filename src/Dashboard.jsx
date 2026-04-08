import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from 'react-router-dom'
import { TiTick } from 'react-icons/ti'
import { useAuth } from "./context/AuthContext";
import { FaWallet, FaChevronLeft, FaChevronRight, FaList } from "react-icons/fa";
import { CgProfile } from "react-icons/cg";
import { FaCartPlus } from "react-icons/fa";
import { FaCediSign, FaLock ,FaRegCopyright} from "react-icons/fa6";
import { Link } from "react-router-dom";
import { doc, setDoc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore'
import { db, auth } from './firebase'
import { updateProfile } from 'firebase/auth'
import PaymentModal from './components/PaymentModal'
import BundleCardSimple from './components/BundleCardSimple.jsx'
import Notice from './components/Notice'

const normalizeOrderStatus = (value) => {
  const s = String(value || '').trim().toLowerCase()
  if (!s) return 'pending'
  if (s === 'completed' || s === 'delivered' || s === 'success' || s === 'sent') return 'completed'
  if (s === 'failed' || s === 'error') return 'failed'
  if (s === 'refunded') return 'refunded'
  if (s === 'processing') return 'processing'
  if (s === 'waiting' || s === 'queued') return 'waiting'
  if (s === 'pending') return 'pending'
  return s
}

const statusMeta = (status) => {
  const s = normalizeOrderStatus(status)
  if (s === 'completed') return { label: 'Delivered', badgeClass: 'bg-green-100 text-green-800' }
  if (s === 'processing') return { label: 'Processing', badgeClass: 'bg-blue-100 text-blue-800' }
  if (s === 'waiting') return { label: 'Waiting', badgeClass: 'bg-orange-100 text-orange-800' }
  if (s === 'failed') return { label: 'Failed', badgeClass: 'bg-red-100 text-red-800' }
  if (s === 'refunded') return { label: 'Refunded', badgeClass: 'bg-slate-200 text-slate-800' }
  if (s === 'pending') return { label: 'Pending', badgeClass: 'bg-yellow-100 text-yellow-800' }
  return { label: 'Unknown', badgeClass: 'bg-gray-100 text-gray-800' }
}

const DATAMART_STATUS_CACHE_KEY = 'datamart_status_cache_v1'
const ORDER_STATUS_POLL_INTERVAL_MS = 30000
const ORDER_STATUS_RECENT_WINDOW_MS = 2 * 60 * 60 * 1000
const MAX_ORDER_STATUS_POLLS = 8
const TERMINAL_ORDER_STATUSES = new Set(['completed', 'failed', 'refunded'])

const loadDatamartStatusCache = () => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(DATAMART_STATUS_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const saveDatamartStatusCache = (cache) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DATAMART_STATUS_CACHE_KEY, JSON.stringify(cache || {}))
  } catch {
    // ignore localStorage failures
  }
}

const parseTimeValue = (value) => {
  if (!value) return 0
  const date = (typeof value === 'number') ? new Date(value) : new Date(String(value))
  const time = date.getTime()
  return Number.isNaN(time) ? 0 : time
}

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
  const [orderStatusMap, setOrderStatusMap] = useState({})
  const orderStatusMapRef = useRef({})
  const ordersRef = useRef([])
  const lastOrderStatusSyncAtRef = useRef(0)
  const datamartStatusCacheRef = useRef(loadDatamartStatusCache())
  
  const [searchParams, setSearchParams] = useSearchParams()
  const [, setSuccessModalOpen] = useState(false)

  useEffect(() => {
    if (!user || !user.uid) return
    setProfileFullName(user.fullName ?? user.displayName ?? '')
    setProfileEmail(user.email ?? '')
    setProfilePhone(user.phone ?? '')
    setProfileUID(user.uid ?? '')
    setProfileReferral(user.referralCode ?? '')
    // listen for balance changes in Firestore (immediately and on updates)
    let unsub
    let unsubProfile
    try {
      const userRef = doc(db, 'users', user.uid)
      
      // Primary listener for balance in real-time
      unsub = onSnapshot(userRef, (snap) => {
        const data = snap.exists() ? snap.data() : {}
        const bal = Number(data.balance ?? data.wallet ?? 0)
        console.log('Balance snapshot received', { userId: user.uid, balance: bal })
        setAvailableBalance(bal)
      }, (err) => {
        console.error('Balance snapshot error', err)
      })
    } catch (e) {
      console.error('Balance listener setup failed', e)
    }

    return () => { 
      if (typeof unsub === 'function') unsub()
      if (typeof unsubProfile === 'function') unsubProfile()
    }
  }, [user?.uid])



  // show success modal when redirected from auto-purchase flow
  useEffect(() => {
    try {
      const saved = searchParams.get('purchaseSaved')
      const pid = searchParams.get('purchaseId')
      if (saved && pid) {
        setSuccessModalOpen(true)
        // clear params so modal doesn't reappear on refresh
        setSearchParams({}, { replace: true })
      }
    } catch {
      // ignore
    }
  }, [searchParams, setSearchParams])

  const items = [
    { id: "wallet", icon: <FaWallet size="1.5em" />, label: "Wallet & Stats" },
    {
      id: "orders",
      icon: <FaCartPlus size="1.5em" />,
      label: "Orders",
      badge: orders.length || undefined,
    },
    { id: "profile", icon: <CgProfile size="1.5em" />, label: "Profile" },
  ];

  const quickBundles = [
    { id: 'mtn', network: 'MTN', dataAmount: '1GB', price: '5.00' },
    { id: 'telecel', network: 'Telecel', dataAmount: '500MB', price: '3.00' },
    { id: 'at', network: 'AirtelTigo', dataAmount: '2GB', price: '8.00' }
  ]

  useEffect(() => {
    orderStatusMapRef.current = orderStatusMap
  }, [orderStatusMap])

  useEffect(() => {
    ordersRef.current = orders
  }, [orders])

  useEffect(() => {
    if (!user?.uid) { setOrders([]); return }
    try {
      const purchasesRef = collection(db, 'purchases')

      const mapSnap = (snap) => snap.docs.map(d => {
        const data = d.data() || {}
        const rawResponse = data.rawResponse || data.raw || {}
        const responseData = rawResponse?.data || {}
        const upstreamData = responseData?.raw || rawResponse?.result || {}
        const orderReference = data.orderReference || data.order_reference || data.reference || data.purchaseId || responseData?.orderReference || responseData?.order_reference || rawResponse?.orderReference || rawResponse?.order_id || upstreamData?.order_id || upstreamData?.id || ''
        const cacheKey = orderReference || d.id
        const cached = datamartStatusCacheRef.current[cacheKey] || null
        const rawPrice = data.displayPrice ?? data.display_price ?? data.uiPrice ?? data.localPrice ?? data.price ?? data.amount ?? 0
        const displayPrice = Number(rawPrice || 0)
        const legacySuccess = !orderReference && (
          String(rawResponse?.status || '').toLowerCase() === 'success' ||
          String(responseData?.status || '').toLowerCase() === 'success' ||
          String(upstreamData?.status || '').toLowerCase() === 'success' ||
          String(data.status || '').toLowerCase() === 'success' ||
          String(data.tx_status || '').toLowerCase() === 'success' ||
          String(data.txStatus || '').toLowerCase() === 'success'
        )
        const rawStatus = data.orderStatus || data.order_status ||
          responseData?.orderStatus || responseData?.order_status || responseData?.status ||
          rawResponse?.orderStatus || rawResponse?.order_status || rawResponse?.status_label ||
          upstreamData?.order_status || upstreamData?.status || upstreamData?.status_label ||
          cached?.status || (legacySuccess ? 'completed' : '')
        const status = normalizeOrderStatus(rawStatus || '')
        const statusUpdatedAt = data.orderStatusUpdatedAt || data.statusUpdatedAt || cached?.updatedAt || null

        if (cacheKey && status && status !== 'pending') {
          datamartStatusCacheRef.current[cacheKey] = { status, updatedAt: statusUpdatedAt }
        }

        let createdAtDate = null
        if (data.createdAt) {
          try {
            if (typeof data.createdAt.toDate === 'function') createdAtDate = data.createdAt.toDate()
            else if (typeof data.createdAt === 'number') createdAtDate = new Date(data.createdAt > 1e12 ? data.createdAt : data.createdAt * 1000)
            else createdAtDate = new Date(data.createdAt)
          } catch {
            createdAtDate = null
          }
        }

        return {
          id: d.id,
          networkNumber: `${data.network || rawResponse?.network || upstreamData?.network || ''} • ${data.phoneNumber || data.phone || data.msisdn || rawResponse?.customer_number || upstreamData?.customer_number || ''}`.trim(),
          phoneNumber: data.phoneNumber || data.phone || data.msisdn || rawResponse?.customer_number || upstreamData?.customer_number || '',
          dataAmount: data.capacity || data.size || data.bundle || rawResponse?.volume || upstreamData?.volume || '',
          price: displayPrice.toFixed(2),
          orderReference,
          transactionId: data.transactionReference || data.transaction_ref || data.tx_ref || data.reference || data.transactionId || data.txId || data.purchaseId || data.id || responseData?.transactionReference || rawResponse?.transactionReference || orderReference || '',
          status,
          statusUpdatedAt,
          createdAt: createdAtDate,
          raw: data
        }
      })

      const subscribe = (q) => onSnapshot(q, (snap) => {
        let items = mapSnap(snap)
        items = items.sort((a,b) => {
          const ta = a.createdAt ? a.createdAt.getTime() : 0
          const tb = b.createdAt ? b.createdAt.getTime() : 0
          return tb - ta
        })
        setOrders(items)
      }, (err) => {
        console.error('Purchases snapshot error', err)
        const msg = String(err?.message || '').toLowerCase()
        if (msg.includes('index') || msg.includes('composite index') || msg.includes('requires an index') || msg.includes('building')) {
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
            return unsubFallback
          } catch (e) {
            console.error('Failed to subscribe fallback purchases query', e)
          }
        }
      })

      const q = query(purchasesRef, where('userId', '==', user.uid), orderBy('createdAt', 'desc'))
      const unsub = subscribe(q)
      return () => unsub()
    } catch (e) {
      console.error('Failed to subscribe to purchases', e)
      setOrders([])
    }
  }, [user])

  useEffect(() => {
    setCurrentPage(1)
    setShowAllOrders(false)
  }, [orders.length])

  useEffect(() => {
    if (!orders.length) {
      setOrderStatusMap({})
      return
    }

    let active = true
    let intervalId

    const shouldPollOrder = (order) => {
      if (!order?.orderReference) return false

      const effectiveStatus = normalizeOrderStatus(orderStatusMapRef.current[order.id]?.status || order.status)
      if (!TERMINAL_ORDER_STATUSES.has(effectiveStatus)) return true

      const recentCutoff = Date.now() - ORDER_STATUS_RECENT_WINDOW_MS
      const createdAtMs = order.createdAt instanceof Date ? order.createdAt.getTime() : 0
      const updatedAtMs = parseTimeValue(orderStatusMapRef.current[order.id]?.updatedAt || order.statusUpdatedAt)
      return Math.max(createdAtMs, updatedAtMs) >= recentCutoff
    }

    const syncOrderStatuses = async (force = false) => {
      const now = Date.now()
      if (!force && (now - lastOrderStatusSyncAtRef.current) < ORDER_STATUS_POLL_INTERVAL_MS) {
        return
      }

      const currentOrders = ordersRef.current
      const candidates = currentOrders
        .filter(shouldPollOrder)
        .slice(0, MAX_ORDER_STATUS_POLLS)

      if (!candidates.length) return

      lastOrderStatusSyncAtRef.current = now

      try {
        const responses = await Promise.all(candidates.map(async (o) => {
          try {
            const r = await fetch(`/.netlify/functions/order-status?reference=${encodeURIComponent(o.orderReference)}`)
            if (!r.ok) return null
            const payload = await r.json()
            const upstream = payload?.data?.orderStatus || payload?.data?.status || payload?.normalized?.orderStatus || ''
            return { id: o.id, status: normalizeOrderStatus(upstream || o.status), updatedAt: payload?.data?.updatedAt || payload?.normalized?.updatedAt || null }
          } catch {
            return null
          }
        }))

        if (!active) return
        const next = {}
        const writes = []

        responses.filter(Boolean).forEach((row) => {
          const sourceOrder = candidates.find((c) => c.id === row.id)
          if (!sourceOrder) return

          const prevEntry = orderStatusMapRef.current[row.id] || null
          const previousStatus = normalizeOrderStatus(prevEntry?.status || sourceOrder.status)
          const previousUpdatedAt = String(prevEntry?.updatedAt || sourceOrder.statusUpdatedAt || '')
          const nextUpdatedAt = String(row.updatedAt || '')
          const changed = row.status !== previousStatus || nextUpdatedAt !== previousUpdatedAt

          if (!changed) return

          next[row.id] = row

          const cacheKey = sourceOrder.orderReference || sourceOrder.id
          datamartStatusCacheRef.current[cacheKey] = { status: row.status, updatedAt: row.updatedAt || null }

          writes.push(
            setDoc(doc(db, 'purchases', sourceOrder.id), {
              orderStatus: row.status,
              orderStatusUpdatedAt: row.updatedAt || null,
              lastStatusSyncAt: new Date().toISOString(),
              statusSource: 'datamart_poll'
            }, { merge: true }).catch((err) => {
              console.warn('Failed to persist Datamart status', sourceOrder.id, err)
            })
          )
        })

        if (Object.keys(next).length > 0) {
          setOrderStatusMap((prev) => ({ ...prev, ...next }))
          saveDatamartStatusCache(datamartStatusCacheRef.current)
          if (writes.length) await Promise.all(writes)
        }
      } catch (e) {
        console.error('Order status sync failed', e)
      }
    }

    syncOrderStatuses(true)
    intervalId = setInterval(() => {
      void syncOrderStatuses()
    }, ORDER_STATUS_POLL_INTERVAL_MS)

    return () => {
      active = false
      if (intervalId) clearInterval(intervalId)
    }
  }, [orders.length])

  const getEffectiveStatus = (order) => normalizeOrderStatus(orderStatusMap[order.id]?.status || order.status)

  const hasChanges = () => {
    if (!user) return false
    const originalName = user.fullName ?? user.displayName ?? ''
    const originalPhone = user.phone ?? ''
    return (String(profileFullName || '') !== String(originalName || '')) || (String(profilePhone || '') !== String(originalPhone || ''))
  }

  const truncate = (tx = '') => {
    const s = String(tx || '')
    if (s.length <= 18) return s
    return `${s.slice(0, 8)}...${s.slice(-6)}`
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div>
      <Notice />
      <div className="flex m-3 p-2 flex-col">
        <h3 className="font-bold text-3xl">Dashboard</h3>
        <p className="mt-2">{getGreeting()}, {user?.fullName || user?.displayName || user?.email || "Guest"}</p>
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
            {/* Merged Balance Stats + Wallet UI */}
            <div className="m-3 p-4 rounded-box shadow-md bg-white">
              {/* Top row: current balance + Top Up */}
              {(() => {
                const now = new Date()
                const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

                let todayOrders = 0
                let todaySpent = 0
                let monthOrders = 0
                let monthSpent = 0
                let completed = 0
                let pending = 0
                let failed = 0
                let allSpent = 0

                orders.forEach((o) => {
                  const created = o.createdAt instanceof Date ? o.createdAt : (o.createdAt ? new Date(o.createdAt) : null)
                  const price = Number(o.price || 0)
                  allSpent += isNaN(price) ? 0 : price

                  if (created) {
                    if (created >= startOfToday) {
                      todayOrders += 1
                      todaySpent += isNaN(price) ? 0 : price
                    }
                    if (created >= startOfMonth) {
                      monthOrders += 1
                      monthSpent += isNaN(price) ? 0 : price
                    }
                  }

                  const st = getEffectiveStatus(o)
                  if (st === 'completed') completed += 1
                  else if (st === 'pending' || st === 'processing' || st === 'waiting') pending += 1
                  else if (st === 'failed' || st === 'refunded') failed += 1
                })

                const allOrders = orders.length
                const currentBalance = Number(availableBalance ?? 0)

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 bg-white">
                      <div>
                        <div className="text-sm text-slate-500">Current Balance</div>
                        <div className="flex items-baseline gap-2">
                          <div className="text-lg sm:text-3xl font-bold text-emerald-600">GHS</div>
                          <div className="text-2xl sm:text-4xl font-extrabold">{currentBalance.toFixed(2)}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setShowPayModal(true)}
                          className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm sm:text-base font-semibold"
                        >Top Up</button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-3 sm:p-4 rounded-lg border border-slate-200 bg-white">
                        <div className="text-xs sm:text-sm text-slate-500">Today</div>
                        <div className="mt-2 font-semibold text-lg">{todayOrders} orders</div>
                        <div className="text-xs sm:text-sm text-slate-400">GHS {todaySpent.toFixed(2)} spent</div>
                      </div>
                      <div className="p-3 sm:p-4 rounded-lg border border-slate-200 bg-white">
                        <div className="text-xs sm:text-sm text-slate-500">This Month</div>
                        <div className="mt-2 font-semibold text-lg">{monthOrders} orders</div>
                        <div className="text-xs sm:text-sm text-slate-400">GHS {monthSpent.toFixed(2)} spent</div>
                      </div>
                      <div className="p-3 sm:p-4 rounded-lg border border-slate-200 bg-white">
                        <div className="text-xs sm:text-sm text-slate-500">All Time</div>
                        <div className="mt-2 font-semibold text-lg">{allOrders} orders</div>
                        <div className="text-xs sm:text-sm text-slate-400">GHS {allSpent.toFixed(2)} spent</div>
                      </div>
                    </div>

                    <div className="p-3 sm:p-4 rounded-lg border border-slate-200 bg-white">
                      <div className="text-xs sm:text-sm text-slate-600 font-semibold mb-3">Order Status Breakdown</div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                        <div className="px-2 py-1 text-xs rounded-full bg-green-50 text-green-700">Completed: {completed}</div>
                        <div className="px-2 py-1 text-xs rounded-full bg-yellow-50 text-yellow-700">Pending: {pending}</div>
                        <div className="px-2 py-1 text-xs rounded-full bg-red-50 text-red-700">Failed: {failed}</div>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div className="m-3">
              <h4 className="font-semibold mb-2">Quick Bundles</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {quickBundles.map((b) => (
                  <BundleCardSimple key={b.id} b={b} cta={{ label: 'Buy Bundle', to: `/${b.id}` }} />
                ))}
              </div>
            </div>

            <div className="flex mb-4 mt-8 text-center justify-center items-center gap-2 text-gray-500">
                     <p><FaRegCopyright className="inline-block" /> 2025 PulseMart. All rights reserved.</p>
            
                  </div>
            <PaymentModal
              open={showPayModal}
              onClose={() => setShowPayModal(false)}
              defaultEmail={profileEmail}
              onSubmit={async (amount) => {
                try {
                  const amt = parseFloat(amount)
                  if (isNaN(amt) || amt <= 0) { alert('Please enter a valid amount'); return }

                  const fee = Number((amt * 0.02).toFixed(2))
                  const total = Number((amt + fee).toFixed(2))
                  const payload = { amount: total, email: profileEmail, callback_url: `${window.location.origin}/paystack/callback`, metadata: { originalAmount: amt, fee } }
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
                      try { text = await resp.text(); const maybeJson = JSON.parse(text || '{}'); throw new Error(maybeJson.message || JSON.stringify(maybeJson) || resp.statusText) } catch { throw new Error(text || resp.statusText || `HTTP ${resp.status}`) }
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
                        try { text = await fallbackResp.text(); const maybeJson = JSON.parse(text || '{}'); throw new Error(maybeJson.message || JSON.stringify(maybeJson) || fallbackResp.statusText) } catch { throw new Error(text || fallbackResp.statusText || `HTTP ${fallbackResp.status}`) }
                      }
                      body = await fallbackResp.json()
                    } catch {
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
              {(() => {
                const q = String(filterQuery || '').trim().toLowerCase()
                const filtered = orders.filter((o) => {
                  if (!q) return true
                  return (String(o.phoneNumber || '').toLowerCase().includes(q) || String(o.transactionId || '').toLowerCase().includes(q))
                })
                if (filtered.length === 0) return (<div className="text-center py-6">No orders yet</div>)

                const pageSize = 3
                const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
                const page = Math.min(Math.max(1, currentPage), totalPages)
                const pageItems = showAllOrders ? filtered : filtered.slice((page-1)*pageSize, page*pageSize)

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pageItems.map((o) => (
                      <div key={o.id} className="p-3 rounded-lg shadow-sm border border-sky-100 bg-linear-to-r from-sky-50 to-sky-100 hover:shadow-md transition font-geom">
                        <div className="flex justify-between items-center">
                          <div className="font-semibold text-slate-800 truncate">{o.networkNumber}</div>
                          <div className="text-sm font-medium text-sky-700 bg-white/60 px-2 py-1 rounded">{Number(o.price || 0).toFixed(2)}</div>
                        </div>

                        <div className="mt-2 text-sm text-slate-700 space-y-1">
                          <div className="grid grid-cols-2 gap-2 items-start">
                            <div>
                              <div className="text-[10px] text-sky-500">Phone</div>
                              <div className="font-mono text-sm">{o.phoneNumber || '-'}</div>
                            </div>

                            <div>
                              <div className="text-[10px] text-sky-500">Data</div>
                              <div className="font-medium text-sm">{o.dataAmount || '-'}</div>
                            </div>

                            <div>
                              <div className="text-[10px] text-sky-500">Status</div>
                              <div className="mt-1">
                                {(() => {
                                  const meta = statusMeta(getEffectiveStatus(o))
                                  return <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${meta.badgeClass}`}>{meta.label}</span>
                                })()}
                              </div>
                            </div>

                            <div>
                              <div className="text-[10px] text-sky-500">Transaction</div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="font-mono break-all text-sm">{truncate(o.transactionId)}</span>
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
                              </div>
                            </div>

                            <div className="col-span-2 text-xs text-slate-400 mt-1">{o.createdAt ? o.createdAt.toLocaleString() : '-'}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {(() => {
                const q2 = String(filterQuery || '').trim().toLowerCase()
                const filtered2 = orders.filter((o) => {
                  if (!q2) return true
                  return (String(o.phoneNumber || '').toLowerCase().includes(q2) || String(o.transactionId || '').toLowerCase().includes(q2))
                })
                const pageSize2 = 3
                const totalPages2 = Math.max(1, Math.ceil(filtered2.length / pageSize2))
                const page2 = Math.min(Math.max(1, currentPage), totalPages2)

                return (
                  <div className="flex items-center justify-between mt-3">
                    <div>
                      {filtered2.length > pageSize2 && (
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
                      {!showAllOrders && filtered2.length > pageSize2 && (
                        <>
                          <button className="btn btn-sm btn-ghost" onClick={() => setCurrentPage((p) => Math.max(1, p-1))} disabled={page2 <= 1}><FaChevronLeft /></button>
                          <div className="text-sm text-gray-600">{page2}/{totalPages2}</div>
                          <button className="btn btn-sm btn-ghost" onClick={() => setCurrentPage((p) => Math.min(totalPages2, p+1))} disabled={page2 >= totalPages2}><FaChevronRight /></button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })()}
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
