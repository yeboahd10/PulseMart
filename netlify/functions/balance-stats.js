const axios = require('axios')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    if (event.httpMethod !== 'GET') return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Method not allowed' }) }

    const upstream = `${String(process.env.HUBNET_BASE_URL || process.env.VITE_HUBNET_BASE_URL || 'https://hubnetgh.site/wp-json/hubnet-api/v1').replace(/\/$/, '')}/check_balance`
    const secretApiKey = process.env.HUBNET_API_KEY || process.env.VITE_API_KEY || process.env.API_KEY || ''

    const resp = await axios.get(upstream, {
      headers: secretApiKey ? { 'X-API-Key': secretApiKey } : undefined,
      timeout: 10000
    })

    const payload = resp.data || {}
    const walletBalance = Number(payload.wallet_balance ?? payload.balance ?? 0) || 0

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
