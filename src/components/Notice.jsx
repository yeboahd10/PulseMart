import React, { useEffect, useState, useRef } from 'react'
import { TiWarning } from 'react-icons/ti'

const STORAGE_KEY = 'noticeDismissed'
const INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

const Notice = () => {
  const [open, setOpen] = useState(false)
  const [dismissedForever, setDismissedForever] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY) === '1'
    setDismissedForever(dismissed)
    if (dismissed) return

    // show immediately on mount
    setOpen(true)

    // schedule recurring opens every 10 minutes
    timerRef.current = setInterval(() => {
      setOpen(true)
    }, INTERVAL_MS)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const closeOnce = () => setOpen(false)

  const dismissForever = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch (e) {
      // ignore
    }
    setDismissedForever(true)
    setOpen(false)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  if (dismissedForever) return null

  return (
    open ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="backdrop-blur-sm bg-white/60 border border-white/30 rounded-2xl shadow-2xl w-11/12 max-w-sm p-6 text-center">
          <button onClick={closeOnce} className="absolute right-4 top-4 text-gray-700">✕</button>
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-blue-50 p-3">
              <TiWarning className="text-sky-600" size={36} />
            </div>
            <div className="text-2xl font-calsans font-bold">NOTICE</div>
            <div className="text-lg font-geom text-gray-700">We are working Today(Sunday).<br/> Delivery is very Smooth (1-10mins)<br/>Keep Orders coming</div>
            <div className="w-full">
              <button onClick={dismissForever} className="w-full mt-3 px-4 py-2 rounded-lg bg-sky-600 text-white">Dismiss forever</button>
            </div>
          </div>
        </div>
      </div>
    ) : null
  )
}

export default Notice
