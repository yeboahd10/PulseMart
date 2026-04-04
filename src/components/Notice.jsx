import React, { useState, useEffect } from 'react'
import { TiWarning } from 'react-icons/ti'
import { db } from '../firebase'
import { doc, onSnapshot } from 'firebase/firestore'

const DEFAULT_NOTICE = 'Good News,Delivery is Going Smoothly. Delivery Tracker is now available for all users. Check it out on the Dashboard to stay updated on your orders!'

const Notice = () => {
  const [open, setOpen] = useState(false)
  const [noticeText, setNoticeText] = useState(DEFAULT_NOTICE)

  useEffect(() => {
    // Real-time listener for notice text from Firestore
    const siteMetaRef = doc(db, 'meta', 'site')
    const unsubscribe = onSnapshot(siteMetaRef, (snap) => {
      if (snap.exists()) {
        const text = snap.data()?.notice || DEFAULT_NOTICE
        setNoticeText(text)
        checkShouldShow(text)
      } else {
        setNoticeText(DEFAULT_NOTICE)
        checkShouldShow(DEFAULT_NOTICE)
      }
    }, (err) => {
      console.warn('Failed to fetch notice text', err)
      setNoticeText(DEFAULT_NOTICE)
      checkShouldShow(DEFAULT_NOTICE)
    })

    // Cleanup listener on unmount
    return () => unsubscribe()
  }, [])

  const checkShouldShow = (text) => {
    // Create a hash of the notice text
    const noticeHash = btoa(text) // Simple base64 "hash"

    // Check if dismissed forever with a different notice
    const dismissedForeverHash = localStorage.getItem('noticeDismissForeverHash')
    if (dismissedForeverHash && dismissedForeverHash === noticeHash) {
      // Same notice dismissed forever, don't show
      return
    }

    // Check if dismissed for today
    const dismissedForDay = localStorage.getItem('noticeDismissForDay')
    const today = new Date().toDateString()
    if (dismissedForDay === today) {
      // Dismissed today, don't show
      return
    }

    // Show the notice
    setOpen(true)
  }

  const dismissForDay = () => {
    const today = new Date().toDateString()
    localStorage.setItem('noticeDismissForDay', today)
    setOpen(false)
  }

  const dismissForever = () => {
    // Store the hash of the current notice text so we can show it again if text changes
    const noticeHash = btoa(noticeText)
    localStorage.setItem('noticeDismissForeverHash', noticeHash)
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
