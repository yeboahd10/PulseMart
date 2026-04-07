const axios = require('axios')

const resolveApiKey = () => (
  process.env.ARKESEL_API_KEY ||
  process.env.ARKESEL_SMS_API_KEY ||
  process.env.SMS_API_KEY ||
  process.env.VITE_SMS_KEY ||
  ''
)

const resolveSender = () => (
  process.env.ARKESEL_SENDER_ID ||
  process.env.ARKESEL_SMS_SENDER ||
  process.env.ARKESEL_FROM ||
  process.env.SMS_SENDER_ID ||
  'PULS'
)

const resolveSandbox = () => {
  const raw = String(process.env.ARKESEL_SANDBOX || '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

const normalizePhone = (value) => {
  let digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('233') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 10) return `233${digits.slice(1)}`
  if (digits.length === 9) return `233${digits}`
  return digits
}

const sendArkeselSms = async ({ to, message }) => {
  const apiKey = resolveApiKey()
  if (!apiKey) {
    return { ok: false, skipped: true, reason: 'ARKESEL api key is not configured' }
  }

  const recipient = normalizePhone(to)
  if (!recipient) {
    return { ok: false, skipped: true, reason: 'No valid recipient number' }
  }

  const payload = {
    sender: String(resolveSender()).slice(0, 11),
    message: String(message || '').slice(0, 612),
    recipients: [recipient]
  }

  if (resolveSandbox()) payload.sandbox = true

  try {
    const resp = await axios.post('https://sms.arkesel.com/api/v2/sms/send', payload, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      timeout: 12000
    })

    return {
      ok: true,
      status: resp.status,
      data: resp.data,
      recipient
    }
  } catch (err) {
    return {
      ok: false,
      status: err.response?.status || 500,
      error: err.response?.data || err.message,
      recipient
    }
  }
}

module.exports = {
  sendArkeselSms,
  normalizePhone
}
