import React, { useState } from "react";
import { AiOutlineMail, AiOutlineLock, AiOutlineEye, AiOutlineEyeInvisible } from "react-icons/ai";
import { FaRegCopyright } from "react-icons/fa6";
import { useNavigate } from "react-router-dom";
import { useAuth } from './context/AuthContext'

const Login = () => {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e) => {
    e && e.preventDefault()
    setError('')

    // Client-side validation
    if (!email.trim() || !password) {
      setError('Empty field')
      return
    }

    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      // Hide firebase error, show generic message
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center min-h-screen justify-between w-full">
      <div className="card w-full max-w-full sm:max-w-4xl shadow-xl rounded-lg flex justify-center mx-3 sm:mx-0 mt-10 p-6">
        <div className="card-body ">
          <div className="text-center">
            <h2 className="card-title justify-center text-3xl font-bold">
              Welcome Back
            </h2>
            <p>Sign In to continue</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="relative">
              <label className="label">Email</label>
              <input
                type="email"
                className="input h-14 pl-12 w-full"
                placeholder="Email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError('') }}
              />
              <AiOutlineMail className="absolute left-3 top-9.5 flex items-center text-xl text-gray-400" />
            </div>
            <div className="mt-4 relative">
              <label className="label">Password</label>
              <input
                type={showPassword ? "text" : "password"}
                className="input h-14 pl-12 w-full"
                placeholder="Password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (error) setError('') }}
              />
              <AiOutlineLock className="absolute left-3 top-9.5 flex items-center text-xl text-gray-400" />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-9.5 text-xl text-gray-400"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <AiOutlineEyeInvisible /> : <AiOutlineEye />}
              </button>
            </div>

            {error && <p className="text-red-500 mt-2">{error}</p>}

            <div className="flex items-center mt-2 ">
              <label className="label flex items-center gap-2">
                <input type="checkbox" className="checkbox" />
                Remember me
              </label>
            </div>
            <div className="card-actions justify-center mb-4 mt-5">
              <button disabled={loading} type="submit" className="btn btn-primary w-55">{loading ? 'Signing in...' : 'Sign In'}</button>
            </div>
          </form>

          <hr className="w-full mt-2 mb-2" />

          <div>
            <p className="text-center">
              Don't have an account?{" "}
              <a href="/signup" className="text-blue-500">
                Sign Up
              </a>
            </p>
          </div>
        </div>
      </div>

      <div className="flex mb-4 mt-8 text-center justify-center items-center gap-2">
        <p>
          <FaRegCopyright className="inline-block" /> 2025 PulseMart. All rights
          reserved.
        </p>
      </div>
    </div>
  );
};

export default Login;
