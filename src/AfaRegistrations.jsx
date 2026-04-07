import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Notice from './components/Notice'
import { initPaystack } from './utils/paystack'

const AFA_PENDING_REGISTRATION_KEY = 'afa_pending_registration'
const AFA_PROCESSED_REFERENCE_KEY = 'afa_processed_reference'

const AfaRegistrations = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [form, setForm] = useState({
    fullName: '',
    phoneNumber: '',
    ghanaCard: '',
    location: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [successModalOpen, setSuccessModalOpen] = useState(false)

  const onChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const postRegistration = async (payload) => {
    const resp = await fetch('/.netlify/functions/afa-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const body = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      throw new Error(body?.message || body?.error?.message || `Request failed (${resp.status})`)
    }

    return body
  }

  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref')
    if (!reference) return

    const run = async () => {
      setError('')
      setMessage('')

      const alreadyProcessed = sessionStorage.getItem(AFA_PROCESSED_REFERENCE_KEY)
      if (alreadyProcessed && alreadyProcessed === reference) {
        setSuccessModalOpen(true)
        setSearchParams({}, { replace: true })
        return
      }

      const rawPending = sessionStorage.getItem(AFA_PENDING_REGISTRATION_KEY)
      if (!rawPending) {
        setError('Registration details not found after payment. Please try again.')
        setSearchParams({}, { replace: true })
        return
      }

      let pendingPayload = null
      try {
        pendingPayload = JSON.parse(rawPending)
      } catch {
        pendingPayload = null
      }

      if (!pendingPayload) {
        setError('Registration details are invalid. Please try again.')
        setSearchParams({}, { replace: true })
        return
      }

      try {
        setSubmitting(true)

        const verifyResp = await fetch('/.netlify/functions/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference })
        })
        const verifyBody = await verifyResp.json().catch(() => ({}))

        if (!verifyResp.ok) {
          throw new Error(verifyBody?.message || 'Payment verification failed')
        }

        const tx = verifyBody?.data || {}
        if (String(tx?.status || '').toLowerCase() !== 'success') {
          throw new Error('Payment was not successful')
        }

        await postRegistration(pendingPayload)

        sessionStorage.setItem(AFA_PROCESSED_REFERENCE_KEY, reference)
        sessionStorage.removeItem(AFA_PENDING_REGISTRATION_KEY)
        setForm({ fullName: '', phoneNumber: '', ghanaCard: '', location: '' })
        setSuccessModalOpen(true)
        setSearchParams({}, { replace: true })
      } catch (err) {
        setError(String(err?.message || 'Registration failed after payment'))
      } finally {
        setSubmitting(false)
      }
    }

    run()
  }, [searchParams, setSearchParams])

  const onSubmit = async (e) => {
    e.preventDefault()
    setMessage('')
    setError('')

    const payload = {
      full_name: String(form.fullName || '').trim(),
      phone: String(form.phoneNumber || '').trim(),
      ghana_card: String(form.ghanaCard || '').trim(),
      location: String(form.location || '').trim()
    }

    if (!payload.full_name || !payload.phone || !payload.ghana_card || !payload.location) {
      setError('Please fill all required fields.')
      return
    }

    try {
      setSubmitting(true)
      sessionStorage.setItem(AFA_PENDING_REGISTRATION_KEY, JSON.stringify(payload))

      await initPaystack({
        amount: 12.3,
        email: 'info@hubnetgh.site',
        callback_url: `${window.location.origin}/afa-registrations`,
        metadata: {
          purpose: 'afa_registration',
          registration: payload
        }
      })
    } catch (err) {
      setError(String(err?.message || 'Payment initialization failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="py-8 px-4">
      <Notice />
      <div className="max-w-xl mx-auto bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
        <h2 className="text-2xl font-bold text-slate-900">Afa Registrations</h2>
        <p className="text-sm text-slate-500 mt-1">Complete your details below to register.</p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full name</label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => onChange('fullName', e.target.value)}
              className="w-full input input-bordered"
              placeholder="Enter full name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone number</label>
            <input
              type="tel"
              value={form.phoneNumber}
              onChange={(e) => onChange('phoneNumber', e.target.value)}
              className="w-full input input-bordered"
              placeholder="Enter phone number"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ghana card</label>
            <input
              type="text"
              value={form.ghanaCard}
              onChange={(e) => onChange('ghanaCard', e.target.value)}
              className="w-full input input-bordered"
              placeholder="e.g. GHA-123456789-0"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => onChange('location', e.target.value)}
              className="w-full input input-bordered"
              placeholder="Enter location"
              required
            />
          </div>

          <button type="submit" disabled={submitting} className="btn btn-primary w-full">
            {submitting ? 'Processing...' : 'Register'}
          </button>

          <p className="text-xs text-slate-500 text-center">You will make a one-time payment of 12 gh.</p>

          {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2">{message}</div>}
          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</div>}
        </form>
      </div>

      {successModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 text-center">
            <h3 className="text-xl font-bold text-slate-900">Payment successful</h3>
            <p className="mt-2 text-sm text-slate-600">Regisration will be processed soon</p>
            <button
              className="btn btn-primary mt-5 w-full"
              onClick={() => setSuccessModalOpen(false)}
            >
              Okay
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AfaRegistrations
