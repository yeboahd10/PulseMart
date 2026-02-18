import React, { useState, useEffect } from 'react'
import { TiWarning } from 'react-icons/ti'

const PERM_KEY = 'noticeDismissedForever'
const EXPIRY_KEY = 'noticeDismissExpiry'
const DEFAULT_NOTICE = 'Delivery is Smooth Today,Place your orders now.Now Customers can chat with our live agents in realtime and get immediate assistance.'

const Notice = () => {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const force = window.location?.search?.includes('forceNotice=1')
        if (force && import.meta.env.DEV) { setOpen(true); return }
        const perm = localStorage.getItem(PERM_KEY)
        if (perm === '1') { setOpen(false); return }
        const expiry = Number(localStorage.getItem(EXPIRY_KEY)) || 0
        if (expiry && expiry > Date.now()) { setOpen(false); return }
        setOpen(true)
      } else {
        setOpen(true)
      }
    } catch (e) {
      setOpen(true)
    }
  }, [])

  const dismissForDay = () => {
    try {
      if (typeof window !== 'undefined') {
        const nextDay = Date.now() + 24 * 60 * 60 * 1000
        localStorage.setItem(EXPIRY_KEY, String(nextDay))
      }
    } catch (e) {}
    setOpen(false)
  }

  const dismissForever = () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(PERM_KEY, '1')
      }
    } catch (e) {}
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative backdrop-blur-sm bg-white/60 border border-white/30 rounded-2xl shadow-2xl w-11/12 max-w-sm p-6 text-center">
        <button onClick={dismissForDay} className="absolute right-4 top-4 text-gray-700">✕</button>
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full bg-blue-50 p-3">
            <TiWarning className="text-sky-600" size={36} />
          </div>
          <div className="text-2xl font-bold">IMPORTANT NOTICE</div>
          <div className="text-sm text-gray-700 font-Geom">{DEFAULT_NOTICE}</div>
          <div className="w-full flex flex-col gap-2">
            <button onClick={dismissForDay} className="w-full mt-2 px-4 py-2 rounded-lg bg-gray-200 text-gray-800">I've Read,Dismiss </button>
            <button onClick={dismissForever} className="w-full px-4 py-2 rounded-lg bg-black text-white">Dismiss forever</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Notice
