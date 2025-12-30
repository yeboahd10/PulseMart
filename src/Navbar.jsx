import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { FaCediSign } from "react-icons/fa6";

const Navbar = () => {
  const [open, setOpen] = useState(false)

  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const balance = user?.balance ?? 0
  // format as plain number (no $) and show Cedi icon separately
  const formattedBalance = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(balance)

  const closeMenu = () => setOpen(false)

  const handleLogout = () => {
    logout()
    setOpen(false)
    navigate('/')
  }

  return (
    <>
      <div className='relative navbar bg-basee-100 shadow-sm flex-1 justify-between '>
        <div>
          <a className='btn btn-ghost  text-2xl font-bold text-blue-500 ml-2 sm:ml-1'>PulseMart</a>
        </div>

        
        <div className='flex-none hidden sm:flex items-center gap-2'>
          <Link to="/" className='btn btn-ghost  text-md '>Home</Link>
          {user ? (
            <>
              <Link to="/dashboard" className='btn btn-ghost text-md'>Dashboard</Link>
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
            <div className='mr-2 px-2 py-1 bg-gray-100 text-xs rounded-md border shadow-sm text-gray-700 min-w-16 text-center flex items-center justify-center'>
              <FaCediSign className='inline-block mr-1' />
              <span>{formattedBalance}</span>
            </div>
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
        <div className='sm:hidden w-full bg-white shadow-md'>
          <div className='flex flex-col ml-4 mr-4'>
            <Link to="/"><button onClick={closeMenu} className='text-center w-full px-6 py-2 border-b text-md '>Home</button></Link>
            {user ? (
              <>
                <Link to="/dashboard" onClick={closeMenu} className='text-center w-full px-6 py-2 border-b text-md '>Dashboard</Link>
                <button onClick={() => { handleLogout(); closeMenu(); }} className='text-center w-full px-6 py-2 border-b text-md'>Logout</button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={closeMenu} className='text-center w-full px-6 py-2 border-b text-md '>Login</Link>
                <Link to="/signup" onClick={closeMenu} className='text-center w-full px-6 py-2 border-b text-md rounded-md bg-blue-500 text-white'>Sign Up</Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default Navbar
