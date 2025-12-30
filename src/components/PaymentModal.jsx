import React, { useState, useEffect } from 'react'

const PaymentModal = ({ open, onClose, onSubmit, defaultEmail = '' }) => {
  const [amount, setAmount] = useState('')

  useEffect(() => {
    if (!open) setAmount('')
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} />
      <div className="bg-white rounded-lg shadow-lg z-10 w-11/12 max-w-md p-6">
        <h3 className="text-lg font-semibold mb-4">Add Funds</h3>
        <div className="mb-4">
          <label className="block text-sm font-medium">Amount (GHS)</label>
          <input
            className="input w-full mt-1"
            type="text"
            min="0"
            step="0.01"
            
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <p>Minimum deposit: GHS 10.00</p>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => onSubmit(amount)}
            disabled={!amount || Number(amount) <= 0}
          >
            Pay
          </button>
        </div>
      </div>
    </div>
  )
}

export default PaymentModal
