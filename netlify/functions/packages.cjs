const axios = require('axios')

const JSON_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

const providerMap = {
  MTN: process.env.VITE_API_BASE || process.env.API_BASE || '',
  AT: process.env.VITE_API_BASE_AT_PREMIUM || process.env.API_BASE_AT_PREMIUM || '',
  TELECEL: process.env.VITE_API_BASE_TELECEL || process.env.API_BASE_TELECEL || ''
}

exports.handler = async (event) => {
  try {
    const qp = event.queryStringParameters || {}
    const provider = (qp.provider || 'MTN').toUpperCase()
    const target = providerMap[provider]
    if (!target) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Unknown provider or API base not configured' }) }

    const secretApiKey = process.env.VITE_API_KEY || process.env.API_KEY || ''
    const resp = await axios.get(target, {
      headers: secretApiKey ? { 'Authorization': `Bearer ${secretApiKey}` } : undefined,
      timeout: 10000
    })

    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(resp.data) }
  } catch (err) {
    console.error('packages proxy error', err?.response?.data || err.message)
    return { statusCode: err.response?.status || 500, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Failed to fetch packages', error: err.response?.data || err.message }) }
  }
}
