const axios = require('axios')
const crypto = require('crypto')
const { sendArkeselSms } = require('./_shared/arkesel-sms.cjs')
// In-memory map to avoid duplicate processing within the same function instance
// Keys are idempotency keys (prefer Paystack reference when available, otherwise payload hash)
const processedRefs = new Map()
const CACHE_TTL = 5 * 60 * 1000 // keep recent responses for 5 minutes
const LOCK_TTL = 2 * 60 * 1000 // keep in-progress lock for 2 minutes to avoid races

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
}

const resolveHubnetBaseUrl = () => (
  process.env.HUBNET_BASE_URL ||
  process.env.VITE_HUBNET_BASE_URL ||
  'https://hubnetgh.site/wp-json/hubnet-api/v1'
)

const resolveApiKey = () => (
  process.env.HUBNET_API_KEY ||
  process.env.VITE_API_KEY ||
  process.env.API_KEY ||
  ''
)

const normalizeNetwork = (net) => {
  const s = String(net || '').trim().toLowerCase()
  if (!s) return ''
  if (s === 'mtn' || s === 'yello' || s.includes('mtn') || s.includes('yello')) return 'mtn'
  if (s.includes('telecel') || s.includes('vodafone')) return 'telecel'
  if (s === 'at' || s.includes('airtel') || s.includes('tigo') || s.includes('at_premium')) return 'airteltigo'
  return s
}

const normalizePurchaseResponse = (upstreamData, fallbackRequestId) => {
  const raw = upstreamData || {}
  const success = raw?.success === true || String(raw?.status || '').toLowerCase() === 'success'
  const orderId = raw?.order_id || raw?.orderId || raw?.id || null
  const orderReference = String(orderId || fallbackRequestId || '').trim() || null
  const total = Number(raw?.total || raw?.amount || 0) || null

  return {
    success,
    status: success ? 'success' : 'failed',
    message: String(raw?.message || (success ? 'Order placed successfully' : 'Order placement failed')),
    order_id: orderId,
    orderReference,
    transactionReference: orderReference,
    total,
    data: {
      status: success ? 'success' : 'failed',
      orderStatus: success ? 'pending' : 'failed',
      orderReference,
      transactionReference: orderReference,
      total,
      raw
    }
  }
}

const resolveAccountName = (body) => String(
  body?.accountName || body?.userName || body?.name || 'Customer'
).trim() || 'Customer'

const resolveCapacityLabel = (body, normalizedCapacity) => {
  const raw = String(body?.capacityLabel || '').trim()
  if (raw) return raw
  const digits = String(normalizedCapacity || '').replace(/\D/g, '')
  if (!digits) return 'your selected bundle'
  return `${digits}MB`
}

const sendOrderPlacedSms = async (body, normalizedCapacity) => {
  const recipient = body?.accountPhone || body?.phoneNumber || body?.phone || ''
  const accountName = resolveAccountName(body)
  const capacityLabel = resolveCapacityLabel(body, normalizedCapacity)
  const message = `Hello ${accountName}, your order of ${capacityLabel} was placed successfully.`
  return sendArkeselSms({ to: recipient, message })
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }

    if (event.httpMethod === 'GET') {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true, function: 'purchase-proxy' }) }
    }

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Method not allowed' }) }
    }

    const body = event.body ? JSON.parse(event.body) : {}

    const phoneNumber = body.phoneNumber || body.phone || body.msisdn || ''
    let network = body.network || body.net || ''
    let capacity = body.capacity || body.size || body.data || ''

    capacity = String(capacity || '').replace(/[^0-9]/g, '')
    network = normalizeNetwork(network)

    if (!phoneNumber || !network || !capacity) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing required fields: phoneNumber, network, capacity' }) }
    }

    body.phoneNumber = String(phoneNumber)
    body.network = network
    body.capacity = String(capacity)

    const requestId = String(body.request_id || body.requestId || body.paystackReference || body.reference || `req_${Date.now()}`).trim()

    const hubnetPayload = {
      network,
      volume: String(capacity),
      customer_number: String(phoneNumber),
      quantity: Number(body.quantity || 1) || 1,
      request_id: requestId
    }

    const buildPayloadKey = (obj) => {
      try {
        const hash = crypto.createHash('sha256')
        const s = `${String(obj.customer_number || '')}:${String(obj.network || '')}:${String(obj.volume || '')}:${String(obj.quantity || '')}:${String(obj.request_id || '')}`
        hash.update(s)
        return hash.digest('hex')
      } catch (e) {
        return null
      }
    }

    const purchaseUrl = `${resolveHubnetBaseUrl().replace(/\/$/, '')}/place_order`
    if (!purchaseUrl) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Purchase API URL not configured' }) }

    const secretApiKey = resolveApiKey()
    const headers = { 'Content-Type': 'application/json' }
    if (secretApiKey) headers['X-API-Key'] = secretApiKey

    console.log('purchase-proxy: forwarding request', {
      method: event.httpMethod,
      path: event.path,
      purchaseUrl,
      hasApiKey: !!secretApiKey,
      bodySample: typeof body === 'object' ? JSON.stringify(body).slice(0, 1000) : String(body)
    })

    const paystackRef = String(body.paystackReference || body.reference || body.transactionReference || body.tx_ref || body.paymentReference || '').trim() || null
    const idempotencyKey = paystackRef || buildPayloadKey(hubnetPayload) || `key_${Date.now()}_${Math.random().toString(36).slice(2)}`

    const cached = processedRefs.get(idempotencyKey)
    if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
      return { statusCode: cached.status || 200, headers: CORS_HEADERS, body: JSON.stringify(cached.response) }
    }

    if (cached && cached.lock && (Date.now() - cached.lock) < LOCK_TTL) {
      return { statusCode: 202, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Request is already being processed' }) }
    }

    if (paystackRef) {
      try {
        const secret = (process.env.PAYSTACK_SECRET_KEY || process.env.API_PAYSTACK_SECRET_KEY || '')
        if (!secret) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'PAYSTACK_SECRET_KEY not configured' }) }
        if (String(secret).startsWith('pk_')) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Paystack public key detected; use secret key' }) }

        const vresp = await axios.get('https://api.paystack.co/transaction/verify/' + encodeURIComponent(paystackRef), {
          headers: { Authorization: 'Bearer ' + String(secret).trim() },
          timeout: 10000
        })

        const vdata = vresp.data && (vresp.data.data || vresp.data)
        const status = vdata && (vdata.status || (vdata.data && vdata.data.status))
        if (!status || String(status).toLowerCase() !== 'success') {
          return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Paystack transaction not successful', detail: vdata }) }
        }

        if (body.amount && vdata.amount) {
          const expectedKobo = Math.round(Number(body.amount) * 100)
          const received = Number(vdata.amount)
          if (!isNaN(expectedKobo) && expectedKobo !== received) {
            return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Payment amount mismatch', expected: expectedKobo, received }) }
          }
        }

        processedRefs.set(idempotencyKey, { ts: Date.now(), lock: Date.now(), status: 202, response: { message: 'Processing purchase' } })

        headers['Idempotency-Key'] = idempotencyKey

        const resp = await axios.post(purchaseUrl, hubnetPayload, { headers, timeout: 15000 })
        const normalized = normalizePurchaseResponse(resp.data, requestId)
        if (normalized.success) {
          const smsResult = await sendOrderPlacedSms(body, capacity)
          normalized.sms = {
            orderPlaced: smsResult.ok ? 'sent' : 'failed',
            skipped: Boolean(smsResult.skipped),
            reason: smsResult.reason || null
          }
          if (!smsResult.ok && !smsResult.skipped) {
            console.warn('purchase-proxy: order-placed SMS failed', smsResult)
          }
        }

        processedRefs.set(idempotencyKey, { ts: Date.now(), status: resp.status || 200, response: normalized })
        console.log('purchase-proxy: upstream response', { status: resp.status })
        return { statusCode: resp.status || 200, headers: CORS_HEADERS, body: JSON.stringify(normalized) }
      } catch (err) {
        const prev = processedRefs.get(idempotencyKey) || {}
        processedRefs.set(idempotencyKey, { ...prev, ts: Date.now() })
        console.error('purchase-proxy paystack-verified error', err.message || err)
        const status = err.response?.status || 500
        const data = err.response?.data || { message: err.message }
        return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Purchase proxy failed', error: data }) }
      }
    }

    const resp = await axios.post(purchaseUrl, hubnetPayload, { headers, timeout: 15000 })
    const normalized = normalizePurchaseResponse(resp.data, requestId)
    if (normalized.success) {
      const smsResult = await sendOrderPlacedSms(body, capacity)
      normalized.sms = {
        orderPlaced: smsResult.ok ? 'sent' : 'failed',
        skipped: Boolean(smsResult.skipped),
        reason: smsResult.reason || null
      }
      if (!smsResult.ok && !smsResult.skipped) {
        console.warn('purchase-proxy: order-placed SMS failed', smsResult)
      }
    }

    console.log('purchase-proxy: upstream response', { status: resp.status })

    return { statusCode: resp.status || 200, headers: CORS_HEADERS, body: JSON.stringify(normalized) }
  } catch (err) {
    console.error('purchase-proxy error', {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data
    })
    const status = err.response?.status || 500
    const data = err.response?.data || { message: err.message }
    return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Purchase proxy failed', error: data, note: 'Check function logs in Netlify for details' }) }
  }
}
