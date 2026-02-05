import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

// Time thresholds (ms)
const PENDING_MS = 1 * 60 * 1000      // 1 minute
const PROCESSING_MS = 2 * 60 * 60 * 1000 // 2 hours
const DELIVERED_AFTER_MS = PENDING_MS + PROCESSING_MS

export default function useOrderSnapshot(orderId) {
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!orderId) {
      setOrder(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    const ref = doc(db, 'purchases', String(orderId))
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setOrder(null)
        setLoading(false)
        return
      }

      const data = snap.data() || {}

      // Normalize status from various possible fields
      const rawStatus = data.status || data.order_status || data.tx_status || (data.rawResponse && data.rawResponse.status) || ''
      let status = String(rawStatus || '').trim().toLowerCase()

      // Normalize createdAt into a Date if possible
      let createdAtDate = null
      if (data.createdAt) {
        try {
          if (typeof data.createdAt.toDate === 'function') createdAtDate = data.createdAt.toDate()
          else if (typeof data.createdAt === 'number') createdAtDate = new Date(data.createdAt > 1e12 ? data.createdAt : data.createdAt * 1000)
          else createdAtDate = new Date(data.createdAt)
        } catch (e) {
          createdAtDate = null
        }
      }

      // Apply time-based display logic:
      // - first 1 minute: `pending`
      // - after 1 minute up to 2 hours: `processing`
      // - after 2 hours + 1 minute: `delivered`
      try {
        if (createdAtDate) {
          const age = Date.now() - createdAtDate.getTime()
          // If backend already marked delivered/success, prefer that
          if (status === 'success' || status === 'delivered') {
            status = 'delivered'
          } else {
            if (age < PENDING_MS) status = 'pending'
            else if (age < DELIVERED_AFTER_MS) status = 'processing'
            else status = 'delivered'
          }
        } else {
          // no createdAt: fall back to backend status or unknown
          if (!status) status = 'pending'
        }
      } catch (e) {
        // ignore and fall back to raw status
      }

      setOrder({ id: snap.id, ...data, status, createdAt: createdAtDate })
      setLoading(false)
    }, (err) => {
      console.error('order snapshot error', err)
      setError(err)
      setLoading(false)
    })

    return () => unsub()
  }, [orderId])

  return { order, loading, error }
}
