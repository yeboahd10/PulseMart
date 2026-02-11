import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import logo from './assets/PULSEMART.png'
import { FaBell } from 'react-icons/fa6'
import { useAuth } from './context/AuthContext'
import { FaCediSign } from "react-icons/fa6";
import { db } from './firebase'
import { collection, query, orderBy, limit, onSnapshot, getDoc, doc, setDoc } from 'firebase/firestore'

const Navbar = () => {
  const [open, setOpen] = useState(false)
    let animIndex = 0

  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const balance = user?.balance ?? 0
  // format as plain number (no $) and show Cedi icon separately
  const formattedBalance = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(balance)

  const closeMenu = () => setOpen(false)

  const ADMIN_EMAIL = 'akwasiappiah@gmail.com'
  const [hasNewTx, setHasNewTx] = useState(false)
  const [latestObserved, setLatestObserved] = useState(0)

  useEffect(() => {
    if (!user || user?.email !== ADMIN_EMAIL) return

    const purchasesQuery = query(collection(db, 'purchases'), orderBy('createdAt', 'desc'), limit(1))
    const lastSeenRef = doc(db, 'meta', 'admin_last_seen')

    const unsub = onSnapshot(purchasesQuery, async (snap) => {
      try {
        const top = snap.docs[0]
        if (!top) return
        const data = top.data() || {}
        const createdAt = data.createdAt || null

        let latestTs = 0
        if (createdAt?.toDate) latestTs = createdAt.toDate().getTime()
        else if (typeof createdAt === 'number') latestTs = createdAt > 1e12 ? createdAt : createdAt * 1000
        else latestTs = Date.parse(createdAt) || 0

        setLatestObserved(latestTs)

        const lastSeenSnap = await getDoc(lastSeenRef)
        const lastSeen = lastSeenSnap.exists() ? Number(lastSeenSnap.data().ts || 0) : 0
        setHasNewTx(latestTs > lastSeen)
      } catch (err) {
        console.warn('notif listener error', err)
      }
    })

    return () => unsub()
  }, [user])

  const handleNotifClick = async () => {
    try {
      const lastSeenRef = doc(db, 'meta', 'admin_last_seen')
      await setDoc(lastSeenRef, { ts: latestObserved || Date.now() }, { merge: true })
    } catch (err) {
      console.warn('failed to mark notifications read', err)
    }
    setHasNewTx(false)
    setOpen(false)
    navigate('/admin')
  }

  const [buyOpen, setBuyOpen] = useState(false)

  const handleLogout = () => {
    logout()
    setOpen(false)
    navigate('/')
  }

  return (
    <>
      <div className='sticky top-0 z-50 navbar shadow-sm flex-1 justify-between backdrop-blur-sm bg-white/70 border-b border-gray-200'>
        <div>
          <Link to="/" className='btn btn-ghost ml-1 sm:ml-1' aria-label='Home'>
            <img src={logo} alt="PulseMart" className='h-6 sm:h-12' />
          </Link>
        </div>

        
        <div className='flex-none hidden sm:flex items-center gap-2'>
          <Link to="/" className='btn btn-ghost  text-md '>Home</Link>
          {user ? (
            <>
              <div className='ml-2 px-3 py-1 bg-gray-100 text-sm rounded-md border shadow-sm text-gray-700 flex items-center gap-2'>
                <FaCediSign className='inline-block' />
                <span>{formattedBalance}</span>
              </div>
              {user?.email === 'akwasiappiah@gmail.com' && (
                <button onClick={handleNotifClick} title='Notifications' className='relative btn btn-ghost'>
                  <FaBell className='w-5 h-5' />
                  {hasNewTx && <span className='absolute top-0 right-0 inline-block h-2 w-2 rounded-full bg-red-500 ring-1 ring-white'></span>}
                </button>
              )}
              <Link to="/dashboard" className='btn btn-ghost text-md'>Dashboard</Link>
              {user?.email === 'akwasiappiah@gmail.com' && (
                <Link to="/admin" className='btn btn-ghost text-md'>Admin</Link>
              )}
              <button onClick={handleLogout} className='btn btn-ghost text-md'>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" className='btn btn-ghost text-md'>Login</Link>
              <Link to="/signup" className='btn btn-primary text-white ml-2 text-md mr-5'>Sign Up</Link>
            </>
          )}
        </div>

       
        <div className='sm:hidden flex items-center pr-4'>
          {user && (
            <div className='mr-2 px-3 py-1 rounded-md min-w-16 text-center flex items-center justify-center backdrop-blur-sm bg-blue-100/60 border border-white/30 shadow-sm text-gray-700'>
              <FaCediSign className='inline-block mr-1' />
              <span className='font-geom'>{formattedBalance}</span>
            </div>
          )}
          {user?.email === 'akwasiappiah@gmail.com' && (
            <button onClick={handleNotifClick} title='Notifications' className='relative p-2'>
              <FaBell className='w-5 h-5' />
              {hasNewTx && <span className='absolute top-1 right-1 inline-block h-2 w-2 rounded-full bg-red-500 ring-1 ring-white'></span>}
            </button>
          )}
          <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label='Toggle menu' className='p-2'>
            {!open ? (
              <svg xmlns='http://www.w3.org/2000/svg' className='h-6 w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 6h16M4 12h16M4 18h16' />
              </svg>
            ) : (
              <svg xmlns='http://www.w3.org/2000/svg' className='h-6 w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
              </svg>
            )}
          </button>
        </div>
      </div>

      
      {open && (
        <div className='sm:hidden fixed left-3 right-3 top-14 z-40 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200'>
          <div className='flex flex-col divide-y divide-gray-100'>
            <Link to="/" onClick={closeMenu} className={'flex items-center gap-3 px-4 py-3 hover:bg-gray-50 menu-item'} style={{ ['--delay']: `${(animIndex++) * 60}ms` }}>
              <span className='w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center'>
                <svg xmlns='http://www.w3.org/2000/svg' className='w-5 h-5 text-blue-600' viewBox='0 0 24 24' fill='none' stroke='currentColor'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V9.5z' />
                </svg>
              </span>
              <span className='flex-1 text-sm font-medium text-gray-800'>Home</span>
            </Link>

            {user ? (
              <>
                <div className={'px-2 menu-item'} style={{ ['--delay']: `${(animIndex++) * 60}ms` }}>
                  <button
                    onClick={() => setBuyOpen(!buyOpen)}
                    className='w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50'
                    aria-expanded={buyOpen}
                  >
                    <span className='w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center'>
                      <svg xmlns='http://www.w3.org/2000/svg' className='w-5 h-5 text-indigo-600' viewBox='0 0 24 24' fill='none' stroke='currentColor'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M3 7h18M3 12h18M3 17h18' />
                      </svg>
                    </span>
                    <span className='flex-1 text-sm font-medium text-gray-800'>Buy Bundle</span>
                    <svg xmlns='http://www.w3.org/2000/svg' className={`w-4 h-4 text-gray-500 transform ${buyOpen ? 'rotate-90' : ''}`} viewBox='0 0 24 24' fill='none' stroke='currentColor'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M9 5l7 7-7 7' />
                    </svg>
                  </button>

                  {buyOpen && (
                    <div className='flex flex-col items-center mt-1 ml-14 mr-4 w-full divide-y divide-gray-200'>
                      <Link to="/mtn" onClick={() => { setBuyOpen(false); closeMenu(); }} className={'flex items-center gap-3 px-4 py-3 w-full hover:bg-gray-50 menu-item'} style={{ ['--delay']: `${(animIndex++) * 60}ms` }}>
                        <span className='text-amber-600'>MTN</span>
                      </Link>
                      <Link to="/telecel" onClick={() => { setBuyOpen(false); closeMenu(); }} className={'flex items-center gap-3 px-4 py-3 w-full hover:bg-gray-50 menu-item'} style={{ ['--delay']: `${(animIndex++) * 60}ms` }}>
                        <span className='text-red-600'>Telecel</span>
                      </Link>
                      <Link to="/at" onClick={() => { setBuyOpen(false); closeMenu(); }} className={'flex items-center gap-3 px-4 py-3 w-full hover:bg-gray-50 menu-item'} style={{ ['--delay']: `${(animIndex++) * 60}ms` }}>
                        <span className='text-sky-600 text-center'>AT</span>
                      </Link>
                    </div>
                  )}
                </div>

                <Link to="/dashboard" onClick={closeMenu} className={'flex items-center gap-3 px-4 py-3 hover:bg-gray-50 menu-item'} style={{ ['--delay']: `${(animIndex++) * 60}ms` }}>
                  <span className='w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center'>
                    <svg xmlns='http://www.w3.org/2000/svg' className='w-5 h-5 text-gray-700' viewBox='0 0 24 24' fill='none' stroke='currentColor'>
                      <rect x='3' y='3' width='7' height='7' strokeWidth='2' />
                      <rect x='14' y='3' width='7' height='7' strokeWidth='2' />
                      <rect x='14' y='14' width='7' height='7' strokeWidth='2' />
                    </svg>
                  </span>
                  <span className='flex-1 text-sm font-medium text-gray-800'>Dashboard</span>
                </Link>

                {user?.email === 'akwasiappiah@gmail.com' && (
                  <Link to="/admin" onClick={closeMenu} className={'flex items-center gap-3 px-4 py-3 hover:bg-gray-50 menu-item'} style={{ ['--delay']: `${(animIndex++) * 60}ms` }}>
                    <span className='w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center'>
                      <svg xmlns='http://www.w3.org/2000/svg' className='w-5 h-5 text-yellow-600' viewBox='0 0 24 24' fill='none' stroke='currentColor'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z' />
                      </svg>
                    </span>
                    <span className='flex-1 text-sm font-medium text-gray-800'>Admin</span>
                  </Link>
                )}

                <button onClick={() => { handleLogout(); closeMenu(); }} className={'flex items-center gap-3 px-4 py-3 hover:bg-gray-50 w-full text-left menu-item'} style={{ ['--delay']: `${(animIndex++) * 60}ms` }}>
                  <span className='w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center'>
                    <svg xmlns='http://www.w3.org/2000/svg' className='w-5 h-5 text-gray-700' viewBox='0 0 24 24' fill='none' stroke='currentColor'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M17 16l4-4m0 0l-4-4m4 4H7' />
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M7 8v8' />
                    </svg>
                  </span>
                  <span className='flex-1 text-sm font-medium text-gray-800'>Logout</span>
                </button>
                
              </>
            ) : (
              <>
                <Link to="/login" onClick={closeMenu} className={'flex items-center gap-3 px-4 py-3 hover:bg-gray-50 menu-item'} style={{ ['--delay']: `${(animIndex++) * 60}ms` }}>
                  <span className='w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center'>
                    <svg xmlns='http://www.w3.org/2000/svg' className='w-5 h-5 text-gray-700' viewBox='0 0 24 24' fill='none' stroke='currentColor'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M15 12a3 3 0 11-6 0 3 3 0 016 0z' />
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M2 20a10 10 0 0120 0' />
                    </svg>
                  </span>
                  <span className='flex-1 text-sm font-medium text-gray-800'>Login</span>
                </Link>

                <Link to="/signup" onClick={closeMenu} className={'flex items-center gap-3 px-4 py-3 hover:bg-gray-50 menu-item'} style={{ ['--delay']: `${(animIndex++) * 60}ms` }}>
                  <span className='w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center'>
                    <svg xmlns='http://www.w3.org/2000/svg' className='w-5 h-5 text-blue-600' viewBox='0 0 24 24' fill='none' stroke='currentColor'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M12 4v16m8-8H4' />
                    </svg>
                  </span>
                  <span className='flex-1 text-sm font-medium text-gray-800'>Sign Up</span>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default Navbar
