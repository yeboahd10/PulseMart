const axios = require('axios')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
}

// Module-level cache — survives warm Netlify function instances (60s TTL)
const CACHE_TTL_MS = 60 * 1000
let cachedBody = null
let cachedAt = 0

const resolveApiKey = () => (
  process.env.DATAMART_API_KEY ||
  process.env.API_KEY ||
  process.env.VITE_API_KEY ||
  ''
)

const resolveBaseUrl = () => (
  process.env.DATAMART_BASE_URL ||
  'https://api.datamartgh.shop/api/developer'
)

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }

    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Method not allowed' }) }
    }

    const apiKey = resolveApiKey()
    if (!apiKey) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Datamart API key not configured' }) }
    }

    // Return cached response if still fresh
    const now = Date.now()
    if (cachedBody && (now - cachedAt) < CACHE_TTL_MS) {
      return { statusCode: 200, headers: { ...CORS_HEADERS, 'X-Cache': 'HIT' }, body: cachedBody }
    }

    const baseUrl = resolveBaseUrl().replace(/\/$/, '')
    const upstream = await axios.get(`${baseUrl}/delivery-tracker`, {
      headers: {
        'X-API-Key': apiKey,
        Accept: 'application/json'
      },
      timeout: 15000
    })

    const payload = upstream.data || {}
    const data = payload.data || {}

    const responseBody = JSON.stringify({
      ...payload,
      normalized: {
        scanner: data.scanner || null,
        stats: data.stats || null,
        lastDelivered: data.lastDelivered || null,
        checkingNow: data.checkingNow || null,
        yourOrders: data.yourOrders || null,
        message: data.message || ''
      }
    })

    cachedBody = responseBody
    cachedAt = Date.now()

    return {
      statusCode: upstream.status || 200,
      headers: { ...CORS_HEADERS, 'X-Cache': 'MISS' },
      body: responseBody
    }
  } catch (err) {
    const status = err.response?.status || 500
    const data = err.response?.data || { message: err.message }
    // On 429, return stale cache rather than propagating the error
    if (status === 429 && cachedBody) {
      return { statusCode: 200, headers: { ...CORS_HEADERS, 'X-Cache': 'HIT-429' }, body: cachedBody }
    }
    return {
      statusCode: status,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'Delivery tracker lookup failed', error: data })
    }
  }
}
