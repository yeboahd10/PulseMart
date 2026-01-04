import React, { useEffect, useState } from 'react'
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore'
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

  useEffect(() => {
    if (!user || user?.email !== ADMIN_EMAIL) {
      setLoading(false)
      return
    }

    let mounted = true

    const load = async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'))
        const users = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }))

        // For each user, fetch their latest purchase
        const enriched = await Promise.all(users.map(async (u) => {
          try {
            // try to get the most recent purchase by createdAt
            let ps
            try {
              const q = query(collection(db, 'purchases'), where('userId', '==', u.uid), orderBy('createdAt', 'desc'), limit(1))
              ps = await getDocs(q)
            } catch (err) {
              // fallback: some projects may not have an index for orderBy(createdAt)
              // try a simple where + limit(1) to at least return a purchase if present
              const q2 = query(collection(db, 'purchases'), where('userId', '==', u.uid), limit(1))
              ps = await getDocs(q2)
            }

            const doc = ps.docs[0]
            if (!doc) return { ...u, lastOrder: null }

            const data = doc.data() || {}

            // normalize common fields and also look into rawResponse for nested data
            const raw = data.rawResponse || data.raw || null
            const purchaseId = data.purchaseId || data.id || data.transactionId || data.txId || raw?.data?.id || raw?.id || null
            const transactionReference = data.transactionReference || data.transaction_ref || data.tx_ref || data.reference || raw?.data?.transactionReference || raw?.reference || null
            const network = data.network || raw?.metadata?.purchase?.network || raw?.data?.network || null
            const phoneNumber = data.phoneNumber || raw?.metadata?.purchase?.phoneNumber || raw?.data?.phoneNumber || raw?.phoneNumber || null
            const price = data.price ?? data.displayPrice ?? raw?.data?.amount ?? raw?.amount ?? null
            const createdAt = data.createdAt || null

            const normalized = { purchaseId, transactionReference, network, phoneNumber, price, createdAt, raw }

            return { ...u, lastOrder: normalized }
          } catch (err) {
            console.error('Error fetching last purchase for user', u.uid, err)
            return { ...u, lastOrder: null }
          }
        }))

        // sort by most recent activity (lastOrder.createdAt)
        enriched.sort((a, b) => {
          const ta = a.lastOrder?.createdAt?.toDate ? a.lastOrder.createdAt.toDate().getTime() : 0
          const tb = b.lastOrder?.createdAt?.toDate ? b.lastOrder.createdAt.toDate().getTime() : 0
          return tb - ta
        })

        if (mounted) setRows(enriched)
      } catch (err) {
        console.error('Admin load error', err)
        if (mounted) setError(err.message || 'Failed to load')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()

    return () => { mounted = false }
  }, [user])

  // reset to first page when rows change
  useEffect(() => {
    setCurrentPage(1)
  }, [rows.length])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const paginatedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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
                <td className="px-4 py-3">{Number(r.balance ?? r.wallet ?? 0).toFixed(2)}</td>
                <td className="px-4 py-3">{r.lastOrder?.purchaseId || r.lastOrder?.transactionReference || r.lastOrder?.id || '-'}</td>
                <td className="px-4 py-3">
                  {r.lastOrder ? (
                    <div>
                      <div>Network: {r.lastOrder.network || '-'}</div>
                      <div>Phone: {r.lastOrder.phoneNumber || '-'}</div>
                      <div>Price: {r.lastOrder.price ?? r.lastOrder.displayPrice ?? '-'}</div>
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
          <div
            key={r.uid}
            className="p-4 rounded-xl shadow-lg border border-sky-100 bg-gradient-to-r from-sky-50 to-sky-100 hover:shadow-xl transition"
          >
            <div className="flex justify-between items-center">
              <div className="font-semibold text-slate-800  truncate">{r.email || '(no email)'}</div>
              <div className="text-sm font-medium text-sky-700 bg-white/60 px-2 py-1 rounded">{Number(r.balance ?? r.wallet ?? 0).toFixed(2)}</div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-700">
              <div className="flex flex-col">
                <span className="text-xs text-sky-500">Network</span>
                <span className="font-medium">{r.lastOrder?.network || r.lastOrder?.raw?.metadata?.purchase?.network || r.lastOrder?.raw?.data?.network || '-'}</span>
              </div>

              <div className="flex flex-col">
                <span className="text-xs text-sky-500">Phone</span>
                <span className="font-medium">{r.lastOrder?.phoneNumber || r.lastOrder?.raw?.metadata?.purchase?.phoneNumber || r.lastOrder?.raw?.data?.phoneNumber || r.lastOrder?.raw?.phoneNumber || '-'}</span>
              </div>

              <div className="col-span-2 mt-1">
                <span className="text-xs text-sky-500">Price:</span>
                <span className="font-medium ml-1">{r.lastOrder?.price ?? r.lastOrder?.raw?.data?.amount ?? r.lastOrder?.raw?.amount ?? '-'}</span>
              </div>

              <div className="col-span-2 text-xs text-slate-400 mt-2">{formatDate(r.lastOrder?.createdAt || r.lastOrder?.raw?.data?.createdAt || r.lastOrder?.raw?.createdAt)}</div>
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
