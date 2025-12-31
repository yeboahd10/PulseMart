import React from 'react'

export default function Spinner({ label = 'Loading...' }) {
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative">
        <svg className="animate-spin h-10 w-10" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="g1" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
          <circle cx="25" cy="25" r="20" stroke="#e6eef8" strokeWidth="6" />
          <path d="M45 25a20 20 0 00-20-20" stroke="url(#g1)" strokeWidth="6" strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-2 w-2 rounded-full bg-white/90 shadow-sm" />
        </div>
      </div>
      {label && <div className="mt-3 text-sm text-gray-600">{label}</div>}
    </div>
  )
}
