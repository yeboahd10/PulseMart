import React, { useState, useEffect } from 'react'
import { TiWarning } from 'react-icons/ti'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

const STORAGE_KEY = 'noticeDismissExpiry'

const Notice = () => {
  const [open, setOpen] = useState(true)

  const [noticeText, setNoticeText] = useState('Now Customers with outstanding credit or airtime debts, please note that data may not reflect at your end even after been deducted for MTN data .Hence we encourage you to settle your debts before placing orders.')

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const expiry = Number(localStorage.getItem(STORAGE_KEY)) || 0
        if (expiry && expiry > Date.now()) {
          setOpen(false)
          // still subscribe so updated notice is available later
        }
      }
    } catch (e) {
      // ignore storage errors and show the notice
    }

    // subscribe to site meta `notice` field so admins can update in real-time
    let unsub = () => {}
    try {
      const ref = doc(db, 'meta', 'site')
      unsub = onSnapshot(ref, (snap) => {
        const data = snap.exists() ? snap.data() : {}
        const msg = data.notice || data.noticeMessage || data.message || ''
        if (msg) setNoticeText(msg)
      }, (err) => console.warn('notice snapshot error', err))
    } catch (e) {
      // ignore
    }

    return () => unsub()
  }, [])

  const handleClose = () => setOpen(false)

  const handleDismissForDay = () => {
    try {
      if (typeof window !== 'undefined') {
        const nextDay = Date.now() + 24 * 60 * 60 * 1000
        localStorage.setItem(STORAGE_KEY, String(nextDay))
      }
    } catch (e) {}
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="relative backdrop-blur-sm bg-white/60 border border-white/30 rounded-2xl shadow-2xl w-11/12 max-w-sm p-6 text-center">
        <button onClick={handleClose} className="absolute right-4 top-4 text-gray-700">✕</button>
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full bg-blue-50 p-3">
            <TiWarning className="text-sky-600" size={36} />
          </div>
          <div className="text-2xl font-calsans font-bold">IMPORTANT NOTICE</div>
          <div className="text-md font-geom text-gray-700">{noticeText}</div>
          <div className="w-full">
            <button onClick={handleClose} className="w-full mt-4 px-4 py-2 rounded-lg bg-gray-200 text-gray-800">Dismiss</button>
            <button onClick={handleDismissForDay} className="w-full mt-3 px-4 py-2 rounded-lg bg-blue-600 text-white">I've read-Dimiss forever</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Notice
