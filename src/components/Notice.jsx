import React, { useEffect, useState } from 'react'
import { TiWarning } from 'react-icons/ti'

const SESSION_KEY = 'noticeShownThisSession'

const Notice = () => {
  const [open, setOpen] = useState(false)

  // show notice once per browser session (until tab/browser closed)
  useEffect(() => {
    try {
      const shown = typeof window !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1'
      if (!shown) setOpen(true)
    } catch (e) {
      setOpen(true)
    }
  }, [])

  const handleCloseOnce = () => {
    try {
      if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_KEY, '1')
    } catch (e) {}
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="relative backdrop-blur-sm bg-white/60 border border-white/30 rounded-2xl shadow-2xl w-11/12 max-w-sm p-6 text-center">
        <button onClick={handleCloseOnce} className="absolute right-4 top-4 text-gray-700">✕</button>
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full bg-blue-50 p-3">
            <TiWarning className="text-sky-600" size={36} />
          </div>
          <div className="text-2xl font-calsans font-bold">NOTICE</div>
          <div className="text-lg font-geom text-gray-700">Good News!<br/> We're now working 24/7<br/>Place your Orders anytime of the day<br/>Join our WhatsApp Channel for more Updates</div>
          <div className="w-full">
            <button onClick={handleCloseOnce} className="w-full mt-4 px-4 py-2 rounded-lg bg-gray-200 text-gray-800">Dismiss</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Notice
