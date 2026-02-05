import React from 'react'
import { useNavigate } from 'react-router-dom'

const OutOfStockModal = ({ open, onClose, message = 'Bundle out of stock' }) => {
  const navigate = useNavigate()
  if (!open) return null
  const handleOk = () => {
    try { if (typeof onClose === 'function') onClose() } catch (e) {}
    navigate('/')
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="backdrop-blur-sm bg-white/60 border border-white/30 rounded-2xl shadow-2xl w-11/12 max-w-md p-6 text-center">
        <button onClick={onClose} className="absolute right-4 top-4 text-gray-700">✕</button>
        <div className="flex flex-col items-center gap-4">
          <div className="text-lg font-semibold text-gray-900">{message}</div>
          <div className="w-full">
            <button onClick={handleOk} className="w-full mt-3 px-4 py-2 rounded-lg bg-blue-600 text-white">OK</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OutOfStockModal
