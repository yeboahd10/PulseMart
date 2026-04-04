import React, { useState, useEffect } from 'react'
import { TiWarning } from 'react-icons/ti'
import { db } from '../firebase'
import { doc, onSnapshot } from 'firebase/firestore'

const DEFAULT_NOTICE = 'Good News,Delivery is Going Smoothly. Delivery Tracker is now available for all users. Check it out on the Dashboard to stay updated on your orders!'
const DISMISS_FOREVER_KEY = 'noticeDismissForeverSignature'
const DISMISS_DAY_KEY = 'noticeDismissDaySignature'
const DISMISS_DAY_DATE_KEY = 'noticeDismissDayDate'

const getNoticeSignature = (text, updatedAt) => `${updatedAt || 'default'}::${text || DEFAULT_NOTICE}`

const Notice = () => {
  const [open, setOpen] = useState(false)
  const [noticeText, setNoticeText] = useState(DEFAULT_NOTICE)
  const [noticeSignature, setNoticeSignature] = useState(getNoticeSignature(DEFAULT_NOTICE, 'default'))

  function checkShouldShow(signature) {
    const dismissedForeverSignature = localStorage.getItem(DISMISS_FOREVER_KEY)
    if (dismissedForeverSignature && dismissedForeverSignature === signature) {
      return
    }

    const dismissedForDaySignature = localStorage.getItem(DISMISS_DAY_KEY)
    const dismissedForDay = localStorage.getItem(DISMISS_DAY_DATE_KEY)
    const today = new Date().toDateString()
    if (dismissedForDay === today && dismissedForDaySignature === signature) {
      return
    }

    setOpen(true)
  }

  useEffect(() => {
    // Real-time listener for notice text from Firestore
    const siteMetaRef = doc(db, 'meta', 'site')
    const unsubscribe = onSnapshot(siteMetaRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        const text = data?.notice || DEFAULT_NOTICE
        const signature = getNoticeSignature(text, data?.noticeUpdatedAt)
        setNoticeText(text)
        setNoticeSignature(signature)
        checkShouldShow(signature)
      } else {
        const signature = getNoticeSignature(DEFAULT_NOTICE, 'default')
        setNoticeText(DEFAULT_NOTICE)
        setNoticeSignature(signature)
        checkShouldShow(signature)
      }
    }, (err) => {
      console.error('Firestore listener error:', err)
      const signature = getNoticeSignature(DEFAULT_NOTICE, 'default')
      setNoticeText(DEFAULT_NOTICE)
      setNoticeSignature(signature)
      checkShouldShow(signature)
    })

    // Cleanup listener on unmount
    return () => unsubscribe()
  }, [])

  const dismissForDay = () => {
    const today = new Date().toDateString()
    localStorage.setItem(DISMISS_DAY_DATE_KEY, today)
    localStorage.setItem(DISMISS_DAY_KEY, noticeSignature)
    setOpen(false)
  }

  const dismissForever = () => {
    localStorage.setItem(DISMISS_FOREVER_KEY, noticeSignature)
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
          <div className="text-sm text-gray-700 font-Geom">{noticeText}</div>
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
