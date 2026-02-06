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

    const qp = event.queryStringParameters || {}
    const phone = (qp.phone || qp.msisdn || qp.msisdn_raw || '').toString().trim()
    const provider = (qp.provider || qp.network || '').toString().trim()

    if (!phone) return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing required query param: phone' }) }

    // DataMart uses /api/developer/balance for balance lookups
    const upstream = process.env.VITE_API_BALANCE || process.env.API_BALANCE || process.env.VITE_API_BALANCE_STATS || process.env.API_BALANCE_STATS || 'https://api.datamartgh.shop/api/developer/balance'
    const secretApiKey = process.env.VITE_API_KEY || process.env.API_KEY || ''

    // The API examples reference `msisdn` or `phoneNumber` as query param keys — include both for compatibility
    const params = { msisdn: phone, phoneNumber: phone }
    if (provider) params.provider = provider

    const resp = await axios.get(upstream, {
      headers: secretApiKey ? { 'X-API-Key': secretApiKey } : undefined,
      params,
      timeout: 10000
    })

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(resp.data) }
  } catch (err) {
    console.error('balance-stats proxy error', err?.response?.data || err.message)
    const status = err.response?.status || 500
    const data = err.response?.data || { message: err.message }
    return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Failed to fetch balance stats', error: data }) }
  }
}
