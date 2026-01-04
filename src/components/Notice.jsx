import React, { useEffect, useState, useRef } from 'react'
import { TiWarning } from 'react-icons/ti'

const STORAGE_KEY = 'noticeDismissed'
const LAST_CLOSED_KEY = 'noticeLastClosed'
// shortened for testing: 10 seconds
const INTERVAL_MS = 10 * 1000 // 10 seconds

const Notice = () => {
  const [open, setOpen] = useState(false)
  const [dismissedForever, setDismissedForever] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    let dismissed = false
    try {
      dismissed = localStorage.getItem(STORAGE_KEY) === '1'
    } catch (e) {
      dismissed = false
    }
    setDismissedForever(dismissed)
    if (dismissed) return

    // check when it was last closed so we can survive unmounts
    let lastClosed = 0
    try {
      lastClosed = Number(localStorage.getItem(LAST_CLOSED_KEY) || 0)
    } catch (e) {
      lastClosed = 0
    }

    const now = Date.now()
    if (!lastClosed) {
      // never closed before -> show immediately
      setOpen(true)
      return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    }

    const elapsed = now - lastClosed
    if (elapsed >= INTERVAL_MS) {
      // interval passed while away -> show now
      setOpen(true)
      return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    }

    // otherwise schedule reopen for the remaining time
    const remaining = INTERVAL_MS - elapsed
    timerRef.current = setTimeout(() => {
      setOpen(true)
      timerRef.current = null
    }, remaining)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCloseOnce = () => {
    setOpen(false)
    try {
      localStorage.setItem(LAST_CLOSED_KEY, String(Date.now()))
    } catch (e) {
      // ignore
    }

    // schedule reopen 10 minutes after the user closes once
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setOpen(true)
      timerRef.current = null
      try {
        // clear lastClosed so it won't immediately reopen again after remount
        localStorage.removeItem(LAST_CLOSED_KEY)
      } catch (e) {}
    }, INTERVAL_MS)
  }

  const handleDismissForever = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch (e) {
      // ignore
    }
    setDismissedForever(true)
    setOpen(false)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  if (dismissedForever) {
    // show a small reset control so testers can bring the notice back
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => {
            try {
              localStorage.removeItem(STORAGE_KEY)
              localStorage.removeItem(LAST_CLOSED_KEY)
            } catch (e) {}
            setDismissedForever(false)
            setOpen(true)
          }}
          className="px-3 py-2 bg-yellow-400 text-slate-800 rounded shadow"
        >Show notice</button>
      </div>
    )
  }

  return (
    open ? (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
        <div className="relative backdrop-blur-sm bg-white/60 border border-white/30 rounded-2xl shadow-2xl w-11/12 max-w-sm p-6 text-center">
          <button onClick={handleCloseOnce} className="absolute right-4 top-4 text-gray-700">✕</button>
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-blue-50 p-3">
              <TiWarning className="text-sky-600" size={36} />
            </div>
            <div className="text-2xl font-calsans font-bold">NOTICE</div>
            <div className="text-lg font-geom text-gray-700">We are working Today(Sunday).<br/> Delivery is very Smooth (1-10mins)<br/>Keep Orders coming</div>
            <div className="w-full">
              <button onClick={handleDismissForever} className="w-full mt-3 px-4 py-2 rounded-lg bg-sky-600 text-white">Dismiss forever</button>
            </div>
          </div>
        </div>
      </div>
    ) : null
  )
}

export default Notice
