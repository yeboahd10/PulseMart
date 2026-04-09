/* eslint-env node */
/* global exports, process, require */
const axios = require('axios')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
}

const resolveEndpoint = () => (
  process.env.AFA_API_BASE ||
  process.env.AFA_ENDPOINT ||
  process.env.VITE_AFA_BASE ||
  'https://hubnetgh.site/wp-json/afa/v1/register'
)

const resolveApiKey = () => (
  process.env.AFA_API_KEY ||
  process.env.AFA_KEY ||
  process.env.VITE_AFA_KEY ||
  ''
)

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Method not allowed' }) }
    }

    const body = event.body ? JSON.parse(event.body) : {}
    const fullName = String(body.full_name || body.fullName || '').trim()
    const phone = String(body.phone || body.phoneNumber || '').trim()
    const ghanaCard = String(body.ghana_card || body.ghanaCard || '').trim()
    const location = String(body.location || '').trim()

    if (!fullName || !phone || !ghanaCard || !location) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: 'Missing required fields: full_name, phone, ghana_card, location' })
      }
    }

    const apiKey = resolveApiKey()
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: 'AFA API key not configured' })
      }
    }

    const endpoint = String(resolveEndpoint() || '').trim()
    if (!endpoint) {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: 'AFA endpoint not configured' })
      }
    }

    const upstreamPayload = {
      api_key: apiKey,
      full_name: fullName,
      phone,
      ghana_card: ghanaCard,
      location
    }

    const resp = await axios.post(endpoint, upstreamPayload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    })

    return {
      statusCode: resp.status || 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        ...(resp.data || {})
      })
    }
  } catch (err) {
    const status = err.response?.status || 500
    const detail = err.response?.data || { message: err.message }
    return {
      statusCode: status,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: 'AFA registration failed',
        error: detail
      })
    }
  }
}
