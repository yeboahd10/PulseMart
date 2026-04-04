const axios = require('axios')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
}

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

    return {
      statusCode: upstream.status || 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
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
    }
  } catch (err) {
    const status = err.response?.status || 500
    const data = err.response?.data || { message: err.message }
    return {
      statusCode: status,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'Delivery tracker lookup failed', error: data })
    }
  }
}
