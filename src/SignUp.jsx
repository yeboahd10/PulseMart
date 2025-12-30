import React from 'react'

import  { useState } from 'react'
import { AiOutlineMail, AiOutlineLock, AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai";
import { IoPersonCircleSharp } from "react-icons/io5";
import { MdOutlinePassword } from "react-icons/md";
import { FaPhone } from "react-icons/fa6";
import { FaRegCopyright } from "react-icons/fa6";
import { useNavigate } from 'react-router-dom'

// Firebase imports
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'

const SignUp = () => {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const generateCode = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    let s = ''
    for (let i = 0; i < 6; i++) s += letters[Math.floor(Math.random() * letters.length)]
    return s
  }

  const generateUniqueCode = async () => {
    let attempts = 0
    while (attempts < 10) {
      attempts++
      const code = generateCode()
      const q = query(collection(db, 'users'), where('referralCode', '==', code))
      const snap = await getDocs(q)
      if (snap.empty) return code
    }
    throw new Error('Failed to generate unique code')
  }

  const handleSignUp = async (e) => {
    e?.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      const user = cred.user
      await updateProfile(user, { displayName: fullName })

      const referralCode = await generateUniqueCode()

      const userDoc = {
        fullName,
        email,
        phone,
        balance: 0,
        referralCode,
        createdAt: serverTimestamp(),
      }

      await setDoc(doc(db, 'users', user.uid), userDoc)

      navigate('/dashboard')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  return (
     <div className="sm:flex sm:flex-col sm:items-center sm:min-h-screen sm:justify-between sm:w-full lg:flex-col">
       <div className="card w-full max-w-full sm:max-w-4xl  rounded-lg flex justify-center mx-3 sm:mx-0 mt-4 p-6">
           <div className="card-body ">
             <div className="text-center">
               <h2 className="card-title justify-center text-3xl font-bold">
                 Join Us Now!
               </h2>
               <p>Sign Up to get started</p>
             </div>
             {error && <div className="text-red-600 text-center mb-2">{error}</div>}
             <div className="relative">
               <label className="label">Full Name</label>
               <input
                 type="text"
                 className="input h-14 pl-12 w-full"
                 placeholder="Full Name"
                 value={fullName}
                 onChange={(e) => setFullName(e.target.value)}
               />
               <IoPersonCircleSharp className="absolute left-3 top-9.5 flex items-center text-xl text-gray-400" />
             </div>
   
             <div className="relative">
               <label className="label">Email</label>
               <input
                 type="email"
                 className="input h-14 pl-12 w-full"
                 placeholder="Email"
                 value={email}
                 onChange={(e) => setEmail(e.target.value)}
               />
               <AiOutlineMail className="absolute left-3 top-9.5 flex items-center text-xl text-gray-400" />
             </div>

             <div className="relative">
               <label className="label">Phone</label>
               <input
                 type="text"
                 className="input h-14 pl-12 w-full"
                 placeholder="Phone"
                 value={phone}
                 onChange={(e) => setPhone(e.target.value)}
               />
               <FaPhone className="absolute left-3 top-9.5 flex items-center text-xl text-gray-400" />
             </div>

             <div className="mt-1 relative">
               <label className="label">Password</label>
               <input
                 type={showPassword ? 'text' : 'password'}
                 className="input h-14 pl-12 w-full"
                 placeholder="Password"
                 value={password}
                 onChange={(e) => setPassword(e.target.value)}
               />
               <AiOutlineLock className="absolute left-3 top-9.5 flex items-center text-xl text-gray-400" />
               <button
                 type="button"
                 onClick={() => setShowPassword((s) => !s)}
                 className="absolute right-3 top-9.5 text-xl text-gray-400"
                 aria-label={showPassword ? 'Hide password' : 'Show password'}
               >
                 {showPassword ? <AiOutlineEyeInvisible /> : <AiOutlineEye />}
               </button>
             </div>
              <div className="mt-1 relative">
               <label className="label">Confirm Password</label>
               <input
                 type={showConfirmPassword ? 'text' : 'password'}
                 className="input h-14 pl-12 w-full"
                 placeholder="Confirm Password"
                 value={confirmPassword}
                 onChange={(e) => setConfirmPassword(e.target.value)}
               />
               <MdOutlinePassword className="absolute left-3 top-9.5 flex items-center text-xl text-gray-400" />
               <button
                 type="button"
                 onClick={() => setShowConfirmPassword((s) => !s)}
                 className="absolute right-3 top-9.5 text-xl text-gray-400"
                 aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
               >
                 {showConfirmPassword ? <AiOutlineEyeInvisible /> : <AiOutlineEye />}
               </button>
             </div>
             
             <div className="card-actions justify-center mb-4 mt-5">
                 <button onClick={handleSignUp} className="btn btn-primary w-full">{loading ? 'Signing...' : 'Sign Up'}</button>
               </div>
   
               <hr className="w-full mt-2 mb-2" />
   
               <div>
                 <p className="text-center">
                   Already have an account? <a href="/login" className="text-blue-500">Sign In</a>
                 </p>
               </div>

           </div>
         </div>

         <div className="flex mb-4 mt-1 text-center justify-center items-center gap-2 flex-col">
                 <p>
                   <FaRegCopyright className="inline-block" /> 2025 PulseMart. All rights
                   reserved.
                 </p>
               </div>



       </div>
  )
}

export default SignUp
