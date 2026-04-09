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
  process.env.HUBNET_API_KEY ||
  process.env.VITE_API_KEY_HUB ||
  process.env.API_KEY ||
  process.env.VITE_API_KEY ||
  ''
)

const resolveOrderStatusUrl = () => (
  process.env.HUBNET_ORDER_STATUS_URL ||
  process.env.VITE_HUBNET_ORDER_STATUS_URL ||
  ''
)

const normalizeStatus = (value) => {
  const s = String(value || '').trim().toLowerCase()
  if (!s) return 'pending'
  if (s === 'success' || s === 'completed' || s === 'delivered' || s === 'sent') return 'completed'
  if (s === 'failed' || s === 'cancelled' || s === 'error') return 'failed'
  if (s === 'processing') return 'processing'
  if (s === 'queued' || s === 'waiting') return 'waiting'
  return s
}

const pickStatusValue = (payload) => {
  const candidates = [
    payload?.status,
    payload?.order_status,
    payload?.status_label,
    payload?.data?.status,
    payload?.data?.order_status,
    payload?.data?.status_label,
    payload?.result?.status,
    payload?.result?.order_status,
    payload?.result?.status_label
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }

  return ''
}

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
      event.queryStringParameters?.order_id ||
      ''
    ).trim()

    if (!reference) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing reference query parameter' }) }
    }

    const apiKey = resolveApiKey()
    if (!apiKey) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Hubnet API key not configured' }) }
    }

    const orderStatusUrl = resolveOrderStatusUrl()
    if (!orderStatusUrl) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          success: true,
          message: 'Hubnet order status endpoint not configured; returning processing fallback',
          data: {
            orderStatus: 'processing',
            status: 'processing',
            updatedAt: null,
            reference,
            orderReference: reference
          },
          normalized: {
            reference,
            orderStatus: 'processing',
            updatedAt: null
          }
        })
      }
    }

    const upstream = await axios.get(orderStatusUrl, {
      params: { reference },
      headers: {
        token: `Bearer ${apiKey}`,
        Accept: 'application/json'
      },
      timeout: 15000
    })

    const payload = upstream.data || {}
    const details = payload?.data || payload?.result || payload
    const rawStatus = pickStatusValue(payload)
    const orderStatus = normalizeStatus(rawStatus)
    const updatedAt = details?.updated_at || details?.created_at || payload?.updated_at || payload?.created_at || payload?.date || null
    const normalizedReference = String(details?.order_id || payload?.order_id || reference)

    return {
      statusCode: upstream.status || 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: payload.success !== false,
        ...payload,
        data: {
          ...(typeof details === 'object' && details ? details : {}),
          orderStatus,
          status: orderStatus,
          updatedAt,
          reference: normalizedReference,
          orderReference: normalizedReference
        },
        normalized: {
          reference: normalizedReference,
          orderStatus,
          updatedAt
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
