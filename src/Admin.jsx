import React, { useEffect, useState, useRef } from 'react'
import { collection, getDocs, query, where, orderBy, limit, updateDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { useAuth } from './context/AuthContext'

const ADMIN_EMAIL = 'akwasiappiah@gmail.com'

const Admin = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 5
  const mountedRef = useRef(true)
  const [editingId, setEditingId] = useState(null)
  const [editingValue, setEditingValue] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [maintenance, setMaintenance] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState('')
  const [outOfStockMTN, setOutOfStockMTN] = useState(false)
  const [outOfStockTelecel, setOutOfStockTelecel] = useState(false)
  const [outOfStockAT, setOutOfStockAT] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // doc reference for site meta
  const siteMetaRef = doc(db, 'meta', 'site')

  useEffect(() => {
    if (!user || user?.email !== ADMIN_EMAIL) {
      setLoading(false)
      return
    }
    // ensure mountedRef.current is true for this lifecycle
    mountedRef.current = true

    const load = async () => {
      try {
        setLoading(true)
        const usersSnap = await getDocs(collection(db, 'users'))
        const users = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }))

        // Fetch a recent window of purchases and pick the latest per user from that set.
        // This avoids per-user orderBy queries (which may require composite indexes)
        const recentPurchasesSnap = await getDocs(query(collection(db, 'purchases'), orderBy('createdAt', 'desc'), limit(500)))
        const latestMap = new Map()
        recentPurchasesSnap.docs.forEach((d) => {
          const data = d.data() || {}
          const uid = data.userId || data.user || null
          if (!uid) return
          if (!latestMap.has(uid)) latestMap.set(uid, { doc: d, data })
        })

        const enriched = await Promise.all(users.map(async (u) => {
          try {
            let doc = latestMap.get(u.uid)?.doc

            // fallback to per-user query if we didn't find a recent purchase for this user
            if (!doc) {
              try {
                const q = query(collection(db, 'purchases'), where('userId', '==', u.uid), orderBy('createdAt', 'desc'), limit(1))
                const ps = await getDocs(q)
                doc = ps.docs[0]
              } catch (err) {
                const q2 = query(collection(db, 'purchases'), where('userId', '==', u.uid), limit(1))
                const ps2 = await getDocs(q2)
                doc = ps2.docs[0]
              }
            }

            if (!doc) return { ...u, lastOrder: null }

            const data = doc.data() || {}
            const raw = data.rawResponse || data.raw || null
            const purchaseId = data.purchaseId || data.id || data.transactionId || data.txId || raw?.data?.id || raw?.id || null
            const transactionReference = data.transactionReference || data.transaction_ref || data.tx_ref || data.reference || raw?.data?.transactionReference || raw?.reference || null
            const network = data.network || raw?.metadata?.purchase?.network || raw?.data?.network || null
            const phoneNumber = data.phoneNumber || raw?.metadata?.purchase?.phoneNumber || raw?.data?.phoneNumber || raw?.phoneNumber || null
            const price = data.price ?? data.displayPrice ?? raw?.data?.amount ?? raw?.amount ?? null
            const createdAt = data.createdAt || null

            const capacity = data.capacity || data.size || data.bundle || raw?.metadata?.purchase?.capacity || raw?.metadata?.purchase?.size || raw?.metadata?.purchase?.bundle || raw?.data?.capacity || raw?.data?.size || raw?.data?.bundle || ''
            const normalized = { purchaseId, transactionReference, network, phoneNumber, price, createdAt, capacity, raw }
            return { ...u, lastOrder: normalized }
          } catch (err) {
            console.error('Error fetching last purchase for user', u.uid, err)
            return { ...u, lastOrder: null }
          }
        }))

        // sort by most recent activity (lastOrder.createdAt or raw variants)
        const getTimestamp = (obj) => {
          const val = obj?.lastOrder?.createdAt || obj?.lastOrder?.raw?.data?.createdAt || obj?.lastOrder?.raw?.createdAt || null
          if (!val) return 0
          // Firestore Timestamp
          if (val?.toDate) return val.toDate().getTime()
          // number (seconds or milliseconds)
          if (typeof val === 'number') {
            // heuristics: if <=1e12 treat as seconds
            return val > 1e12 ? val : val * 1000
          }
          // string date
          const parsed = Date.parse(val)
          return Number.isNaN(parsed) ? 0 : parsed
        }

        enriched.sort((a, b) => getTimestamp(b) - getTimestamp(a))

        if (mountedRef.current) {
          setRows(enriched)
          try {
            const latestTs = enriched.length ? getTimestamp(enriched[0]) : Date.now()
            const lastSeenRef = doc(db, 'meta', 'admin_last_seen')
            const lastSeenSnap = await getDoc(lastSeenRef)
            if (!lastSeenSnap.exists()) {
              await setDoc(lastSeenRef, { ts: latestTs }, { merge: true })
            }
          } catch (e) {
            console.warn('admin last-seen init error', e)
          }
        }
      } catch (err) {
        console.error('Admin load error', err)
        if (mountedRef.current) setError(err.message || 'Failed to load')
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }

    // initial load
    load()
    // load maintenance state
    const loadMaintenance = async () => {
      try {
        const snap = await getDoc(siteMetaRef)
        if (snap.exists()) {
          const data = snap.data() || {}
          setMaintenance(Boolean(data.maintenance))
          setMaintenanceMessage(data.message || '')
          setOutOfStockMTN(Boolean(data.outOfStock_MTN))
          setOutOfStockTelecel(Boolean(data.outOfStock_TELECEL))
          setOutOfStockAT(Boolean(data.outOfStock_AT))
        }
      } catch (e) {
        console.warn('failed to load site meta', e)
      }
    }
    loadMaintenance()

    // reload when window/tab becomes active so latest transactions bubble to top
    const onFocus = () => {
      load()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') load()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      mountedRef.current = false
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [user])

  // reset to first page when rows change
  useEffect(() => {
    setCurrentPage(1)
  }, [rows.length])

  const filteredRows = (function () {
    const q = String(searchTerm || '').trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => {
      const email = String(r.email || '').toLowerCase()
      const name = String(r.fullName || r.displayName || r.name || '').toLowerCase()
      return email.includes(q) || name.includes(q)
    })
  })()

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const paginatedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const formatDate = (ts) => {
    if (!ts) return '-'
    try {
      if (ts.toDate) return new Date(ts.toDate()).toLocaleString()
      return new Date(ts).toLocaleString()
    } catch (e) {
      return '-'
    }
  }

  if (!user || user?.email !== ADMIN_EMAIL) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h2 className="text-2xl font-semibold mb-4">Not authorized</h2>
        <p>You must be the admin to view this page.</p>
      </div>
    )
  }

  if (loading) return <div className="p-6 max-w-4xl mx-auto">Loading...</div>
  if (error) return <div className="p-6 max-w-4xl mx-auto">Error: {error}</div>

  return (
    <div className="p-6 max-w-6xl mx-auto font-geom">
      <h2 className="text-2xl font-semibold mb-4">Admin Console</h2>
      {/* search input moved below Bundle Availability */}
      {/* Maintenance toggle */}
      <div className="mb-6 p-4 border rounded bg-white">
        <h3 className="text-lg font-medium">Maintenance Mode</h3>
        <div className="mt-2 flex flex-col  items-start sm:items-center gap-3">
          <label className="flex items-center gap-2 w-full sm:w-auto">
            <input type="checkbox" checked={maintenance} onChange={async (e) => {
              const next = e.target.checked
              setMaintenance(next)
              try {
                // Persist the maintenance flag and optional message to Firestore
                // To change the persisted values manually, edit the document at `meta/site` in Firestore.
                await setDoc(siteMetaRef, { maintenance: next, message: maintenanceMessage || '' }, { merge: true })
              } catch (err) {
                console.error('Failed to update maintenance flag', err)
              }
            }} />
            <span className="text-sm">Enable maintenance mode</span>
          </label>
          <input className="w-full sm:flex-1 px-2 py-1 border rounded text-sm" placeholder="Optional maintenance message" value={maintenanceMessage} onChange={(e) => setMaintenanceMessage(e.target.value)} />
          <button className="w-full sm:w-auto px-3 py-1 bg-sky-600 text-white rounded" onClick={async () => {
            try {
              await setDoc(siteMetaRef, { maintenance, message: maintenanceMessage || '' , outOfStock_MTN: outOfStockMTN, outOfStock_TELECEL: outOfStockTelecel, outOfStock_AT: outOfStockAT }, { merge: true })
            } catch (err) {
              console.error('Failed to save maintenance message', err)
            }
          }}>Save</button>
        </div>
      </div>
      {/* Bundle stock toggles */}
      <div className="mb-6 p-4 border rounded bg-white">
        <h3 className="text-lg font-medium">Bundle Availability</h3>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={outOfStockMTN} onChange={async (e) => {
              const next = e.target.checked
              setOutOfStockMTN(next)
              try { await setDoc(siteMetaRef, { outOfStock_MTN: next }, { merge: true }) } catch (err) { console.error('Failed to update outOfStock MTN', err) }
            }} />
            <span className="text-sm">MTN bundles out of stock</span>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={outOfStockTelecel} onChange={async (e) => {
              const next = e.target.checked
              setOutOfStockTelecel(next)
              try { await setDoc(siteMetaRef, { outOfStock_TELECEL: next }, { merge: true }) } catch (err) { console.error('Failed to update outOfStock Telecel', err) }
            }} />
            <span className="text-sm">Telecel bundles out of stock</span>
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={outOfStockAT} onChange={async (e) => {
              const next = e.target.checked
              setOutOfStockAT(next)
              try { await setDoc(siteMetaRef, { outOfStock_AT: next }, { merge: true }) } catch (err) { console.error('Failed to update outOfStock AT', err) }
            }} />
            <span className="text-sm">Airtel/Tigo bundles out of stock</span>
          </label>
        </div>
      </div>
      <div className="mb-4 mt-4">
        <input
          type="search"
          placeholder="Search users by name or email"
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
          className="w-full sm:max-w-md px-3 py-2 border rounded text-sm"
        />
      </div>
      {/* Large screen: keep table layout */}
      <div className="hidden sm:block overflow-x-auto bg-white rounded-lg shadow-sm border">
        <table className="min-w-full text-sm divide-y">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Last Order ID</th>
              <th className="px-4 py-3">Last Order Details</th>
              <th className="px-4 py-3">Last Order Time</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginatedRows.map((r) => (
              <tr key={r.uid} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{r.email || '(no email)'}</td>
                <td className="px-4 py-3">
                  {editingId === r.uid ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        className="w-24 px-2 py-1 border rounded text-sm"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                      />
                      <button
                        onClick={async () => {
                          const val = Number(editingValue)
                          if (Number.isNaN(val)) return
                          setSavingId(r.uid)
                          try {
                            await updateDoc(doc(db, 'users', r.uid), { balance: val })
                            setRows((prev) => prev.map(p => p.uid === r.uid ? { ...p, balance: val } : p))
                          } catch (err) {
                            console.error('Failed to update balance', err)
                          } finally {
                            setSavingId(null)
                            setEditingId(null)
                            setEditingValue('')
                          }
                        }}
                        className="px-2 py-1 bg-sky-600 text-white rounded text-sm"
                        disabled={savingId === r.uid}
                      >Save</button>
                      <button onClick={() => { setEditingId(null); setEditingValue('') }} className="px-2 py-1 border rounded text-sm">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>{Number(r.balance ?? r.wallet ?? 0).toFixed(2)}</span>
                      <button onClick={() => { setEditingId(r.uid); setEditingValue(String(Number(r.balance ?? r.wallet ?? 0))) }} title="Edit balance" className="text-sky-600 hover:text-sky-800">✎</button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">{r.lastOrder?.purchaseId || r.lastOrder?.transactionReference || r.lastOrder?.id || '-'}</td>
                <td className="px-4 py-3">
                  {r.lastOrder ? (
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm text-slate-500">Network</div>
                        <div className="font-medium">{r.lastOrder.network || r.lastOrder?.raw?.metadata?.purchase?.network || r.lastOrder?.raw?.data?.network || '-'}</div>

                        <div className="mt-2">
                          <div className="text-sm text-slate-500">Phone</div>
                          <div className="font-medium">{r.lastOrder.phoneNumber || r.lastOrder.raw?.metadata?.purchase?.phoneNumber || r.lastOrder.raw?.data?.phoneNumber || r.lastOrder.raw?.phoneNumber || '-'}</div>

                          <div className="text-xs text-slate-400 mt-1">Capacity: {r.lastOrder.capacity || r.lastOrder.raw?.metadata?.purchase?.capacity || r.lastOrder.raw?.data?.capacity || '-'}</div>
                        </div>
                      </div>

                      <div className="flex flex-col  ">
                        <div className="text-xs text-slate-500">Price</div>
                        <div className="font-medium">{r.lastOrder.price ?? r.lastOrder.displayPrice ?? r.lastOrder.raw?.data?.amount ?? r.lastOrder.raw?.amount ?? '-'}</div>
                      </div>
                    </div>
                  ) : '-'}
                </td>
                <td className="px-4 py-3">{formatDate(r.lastOrder?.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Small screen: simplified cards */}
      <div className="sm:hidden space-y-3">
        {paginatedRows.map((r) => (
          <div key={r.uid} className="p-4 rounded-xl shadow-lg border border-sky-100 bg-gradient-to-r from-sky-50 to-sky-100 hover:shadow-xl transition">
            <div className="flex justify-between items-center">
              <div className="font-semibold text-slate-800 truncate">{r.email || '(no email)'}</div>
              <div>
                {editingId === r.uid ? (
                  <div className="flex items-center gap-2">
                    <input type="number" step="0.01" className="w-24 px-2 py-1 border rounded text-sm" value={editingValue} onChange={(e) => setEditingValue(e.target.value)} />
                    <button
                      onClick={async () => {
                        const val = Number(editingValue)
                        if (Number.isNaN(val)) return
                        setSavingId(r.uid)
                        try {
                          await updateDoc(doc(db, 'users', r.uid), { balance: val })
                          setRows((prev) => prev.map(p => p.uid === r.uid ? { ...p, balance: val } : p))
                        } catch (err) {
                          console.error('Failed to update balance', err)
                        } finally {
                          setSavingId(null)
                          setEditingId(null)
                          setEditingValue('')
                        }
                      }}
                      className="px-2 py-1 bg-sky-600 text-white rounded text-sm"
                      disabled={savingId === r.uid}
                    >Save</button>
                    <button onClick={() => { setEditingId(null); setEditingValue('') }} className="px-2 py-1 border rounded text-sm">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-sky-700 bg-white/60 px-2 py-1 rounded">{Number(r.balance ?? r.wallet ?? 0).toFixed(2)}</div>
                    <button onClick={() => { setEditingId(r.uid); setEditingValue(String(Number(r.balance ?? r.wallet ?? 0))) }} title="Edit balance" className="text-sky-600 hover:text-sky-800">✎</button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 text-sm text-slate-700 space-y-2">
              <div>
                <span className="text-xs text-sky-500">Network</span>
                <div className="font-medium">{r.lastOrder?.network || r.lastOrder?.raw?.metadata?.purchase?.network || r.lastOrder?.raw?.data?.network || '-'}</div>
              </div>

              <div>
                <span className="text-xs text-sky-500">Phone</span>
                <div className="font-medium">{r.lastOrder?.phoneNumber || r.lastOrder?.raw?.metadata?.purchase?.phoneNumber || r.lastOrder?.raw?.data?.phoneNumber || r.lastOrder?.raw?.phoneNumber || '-'}</div>
              </div>

              <div>
                <span className="text-xs text-sky-500">Price</span>
                <div className="font-medium">{r.lastOrder?.price ?? r.lastOrder?.raw?.data?.amount ?? r.lastOrder?.raw?.amount ?? '-'}</div>
              </div>

              <div>
                <span className="text-xs text-sky-500">Capacity</span>
                <div className="font-medium">{r.lastOrder?.capacity || r.lastOrder?.raw?.metadata?.purchase?.capacity || r.lastOrder?.raw?.data?.capacity || '-'}</div>
              </div>

              <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
                <div className="text-xs text-slate-400">{formatDate(r.lastOrder?.createdAt || r.lastOrder?.raw?.data?.createdAt || r.lastOrder?.raw?.createdAt)}</div>
                <div>
                  <button onClick={async () => { setEditingId(r.uid); setEditingValue(String(Number(r.balance ?? r.wallet ?? 0))) }} className="ml-2 text-xs px-2 py-1 bg-white border rounded text-sky-600">Update</button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Pagination controls */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-600">Showing {(rows.length === 0) ? 0 : ( (currentPage - 1) * pageSize + 1)} - {Math.min(currentPage * pageSize, rows.length)} of {rows.length}</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className={`px-3 py-1 rounded-md border ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}`}>
            Prev
          </button>
          <div className="text-sm text-gray-700">Page {currentPage} / {totalPages}</div>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className={`px-3 py-1 rounded-md border ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}`}>
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

export default Admin
