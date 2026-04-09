const axios = require('axios')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
}

const resolveHubnetBaseUrl = () => (
  process.env.HUBNET_BASE_URL ||
  process.env.VITE_HUBNET_BASE_URL ||
  'https://console.hubnet.app/live/api/context/business/transaction'
)

const resolveApiKey = () => (
  process.env.HUBNET_API_KEY ||
  process.env.VITE_API_KEY_HUB ||
  process.env.VITE_API_KEY ||
  process.env.API_KEY ||
  ''
)

const extractBalance = (payload) => {
  const candidates = [
    payload?.wallet_balance,
    payload?.balance,
    payload?.data?.wallet_balance,
    payload?.data?.balance,
    payload?.wallet?.balance,
    payload?.data?.wallet?.balance
  ]

  for (const candidate of candidates) {
    const numeric = Number(candidate)
    if (Number.isFinite(numeric)) return numeric
  }

  return 0
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    if (event.httpMethod !== 'GET') return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Method not allowed' }) }

    const upstream = `${resolveHubnetBaseUrl().replace(/\/$/, '')}/check_balance`
    const secretApiKey = resolveApiKey()

    const resp = await axios.get(upstream, {
      headers: secretApiKey ? { token: `Bearer ${secretApiKey}`, Accept: 'application/json' } : undefined,
      timeout: 10000
    })

    const payload = resp.data || {}
    const walletBalance = extractBalance(payload)

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ...payload,
        normalized: {
          wallet_balance: walletBalance,
          balance: walletBalance
        }
      })
    }
  } catch (err) {
    console.error('balance-stats proxy error', err?.response?.data || err.message)
    const status = err.response?.status || 500
    const data = err.response?.data || { message: err.message }
    return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Failed to fetch balance stats', error: data }) }
  }
}
