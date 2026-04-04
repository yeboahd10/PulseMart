/* eslint-env node */
/* global require, process, exports */
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

    const reference = String(
      event.queryStringParameters?.reference ||
      event.queryStringParameters?.orderReference ||
      ''
    ).trim()

    if (!reference) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing reference query parameter' }) }
    }

    const apiKey = resolveApiKey()
    if (!apiKey) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Datamart API key not configured' }) }
    }

    const baseUrl = resolveBaseUrl().replace(/\/$/, '')
    const upstream = await axios.get(`${baseUrl}/order-status/${encodeURIComponent(reference)}`, {
      headers: {
        'X-API-Key': apiKey,
        Accept: 'application/json'
      },
      timeout: 15000
    })

    const payload = upstream.data || {}
    const data = payload.data || {}
    const rawStatus = data.orderStatus || data.status || payload.orderStatus || payload.status || ''

    return {
      statusCode: upstream.status || 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ...payload,
        normalized: {
          reference: data.reference || data.orderReference || reference,
          orderStatus: String(rawStatus || '').toLowerCase(),
          updatedAt: data.updatedAt || null
        }
      })
    }
  } catch (err) {
    const status = err.response?.status || 500
    const data = err.response?.data || { message: err.message }
    return {
      statusCode: status,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'Order status lookup failed', error: data })
    }
  }
}
