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
  'https://console.hubnet.app/live/api/context/business/transaction'
)

const resolveApiKey = () => (
  process.env.HUBNET_API_KEY ||
  process.env.VITE_API_KEY_HUB ||
  process.env.VITE_API_KEY ||
  process.env.API_KEY ||
  ''
)

// Build the webhook URL Hubnet should POST back to when data delivery changes
const resolveWebhookUrl = () => {
  const explicit = process.env.HUBNET_WEBHOOK_URL || ''
  if (explicit) return explicit
  // Netlify auto-sets URL (canonical site URL) and DEPLOY_URL (this deploy)
  const base = process.env.URL || process.env.DEPLOY_URL || process.env.SITE_URL || ''
  if (base) return `${base.replace(/\/$/, '')}/.netlify/functions/hubnet-webhook`
  return ''
}

const normalizeNetwork = (net) => {
  const s = String(net || '').trim().toLowerCase()
  if (!s) return ''
  if (s === 'mtn' || s === 'yello' || s.includes('mtn') || s.includes('yello')) return 'mtn'
  if (s.includes('telecel') || s.includes('vodafone') || s.includes('big-time')) return 'big-time'
  if (s === 'at' || s.includes('airtel') || s.includes('tigo') || s.includes('at_premium')) return 'at'
  return s
}

const buildHubnetReference = (seed) => {
  const cleaned = String(seed || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 25)
  if (cleaned.length >= 6) return cleaned
  return `HB${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.replace(/[^A-Za-z0-9-]/g, '').slice(0, 25)
}

const sanitizePhone = (value) => String(value || '').replace(/\D/g, '').slice(-10)

const normalizePurchaseResponse = (upstreamData, fallbackRequestId) => {
  const raw = upstreamData || {}
  const nested = raw?.data || raw?.result || {}
  const success =
    raw?.status === true ||
    nested?.status === true ||
    String(raw?.status || '').toLowerCase() === 'success' ||
    String(nested?.status || '').toLowerCase() === 'success' ||
    raw?.success === true ||
    nested?.success === true ||
    String(raw?.message || '').trim() === '0000' ||
    String(nested?.message || '').trim() === '0000' ||
    String(raw?.reason || '').toLowerCase() === 'successful' ||
    String(raw?.code || '').toLowerCase().includes('successfully')
  const orderId = raw?.transaction_id || raw?.payment_id || raw?.order_id || raw?.orderId || raw?.id || nested?.transaction_id || nested?.payment_id || nested?.order_id || nested?.orderId || nested?.id || null
  const orderReference = String(raw?.reference || nested?.reference || fallbackRequestId || '').trim() || null
  const transactionReference = String(raw?.transaction_id || nested?.transaction_id || raw?.payment_id || nested?.payment_id || orderReference || '').trim() || null
  const total = Number(raw?.total || raw?.amount || nested?.total || nested?.amount || 0) || null
  const message = String(raw?.code || nested?.code || raw?.reason || nested?.reason || raw?.message || nested?.message || (success ? 'Order placed successfully' : 'Order placement failed'))

  return {
    success,
    status: success ? 'success' : 'failed',
    message,
    order_id: orderId,
    orderReference,
    transactionReference,
    total,
    data: {
      status: success ? 'success' : 'failed',
      orderStatus: success ? 'processing' : 'failed',
      orderId,
      orderReference,
      transactionReference,
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
  // only use capacityLabel if it contains a letter (e.g. "1 GB", "500MB"), not a bare number
  if (raw && /[a-zA-Z]/.test(raw)) return raw
  const digits = Number(String(normalizedCapacity || '').replace(/\D/g, ''))
  if (!digits) return 'your selected bundle'
  if (digits >= 1000) return `${(digits / 1000).toFixed(digits % 1000 === 0 ? 0 : 1)} GB`
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
    // Handle preflight
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }

    // Health check for GET (useful during netlify dev)
    if (event.httpMethod === 'GET') {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true, function: 'purchase-proxy' }) }
    }

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Method not allowed' }) }
    }

    const body = event.body ? JSON.parse(event.body) : {}

    const phoneNumber = sanitizePhone(body.phoneNumber || body.phone || body.msisdn || '')
    let network = body.network || body.net || ''
    let capacity = body.capacity || body.size || body.data || ''

    capacity = String(capacity || '').replace(/[^0-9]/g, '')
    network = normalizeNetwork(network)

    if (!phoneNumber || phoneNumber.length !== 10 || !network || !capacity) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing required fields: phoneNumber, network, capacity' }) }
    }

    body.phoneNumber = String(phoneNumber)
    body.network = network
    body.capacity = String(capacity)

    // create a stable idempotency key based on payload if Paystack ref not provided
    const buildPayloadKey = (obj) => {
      try {
        const hash = crypto.createHash('sha256')
        // include fields that uniquely identify a purchase attempt
        const s = `${String(obj.phoneNumber||'')}:${String(obj.network||'')}:${String(obj.capacity||'')}:${String(obj.amount||'')}:${String(obj.clientId||'')}`
        hash.update(s)
        return hash.digest('hex')
      } catch (e) {
        return null
      }
    }

    const secretApiKey = resolveApiKey()
    if (!secretApiKey) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Hubnet API key not configured' }) }

    const paystackRef = String(body.paystackReference || body.reference || body.transactionReference || body.tx_ref || body.paymentReference || '').trim() || null
    const requestId = buildHubnetReference(body.request_id || body.requestId || paystackRef)
    const purchaseUrl = `${resolveHubnetBaseUrl().replace(/\/$/, '')}/${network}-new-transaction`
    if (!purchaseUrl) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Purchase API URL not configured' }) }

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      token: `Bearer ${secretApiKey}`
    }

    // Diagnostic logging (avoid printing secrets)
    console.log('purchase-proxy: forwarding request', {
      method: event.httpMethod,
      path: event.path,
      purchaseUrl,
      hasApiKey: !!secretApiKey,
      bodySample: typeof body === 'object' ? JSON.stringify(body).slice(0, 1000) : String(body)
    })

    const referrer = sanitizePhone(body.referrer || body.accountPhone || '')
    const webhookUrl = resolveWebhookUrl()

    const hubnetPayload = {
      phone: String(phoneNumber),
      volume: String(capacity),
      reference: requestId,
      ...(referrer ? { referrer } : {}),
      ...(webhookUrl ? { webhook: webhookUrl } : (body.webhook ? { webhook: String(body.webhook).trim() } : {}))
    }

    // choose idempotency key: prefer paystackRef, otherwise payload hash
    const idempotencyKey = paystackRef || buildPayloadKey(body) || `key_${Date.now()}_${Math.random().toString(36).slice(2)}`

    // return cached response if recently processed in this instance
    const cached = processedRefs.get(idempotencyKey)
    if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
      return { statusCode: cached.status || 200, headers: CORS_HEADERS, body: JSON.stringify(cached.response) }
    }

    // detect in-progress lock
    if (cached && cached.lock && (Date.now() - cached.lock) < LOCK_TTL) {
      return { statusCode: 202, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Request is already being processed' }) }
    }

    // If caller provided a Paystack transaction reference, verify it first and apply idempotency
    if (paystackRef) {
      try {
        const secret = (process.env.PAYSTACK_SECRET_KEY || process.env.API_PAYSTACK_SECRET_KEY || '')
        if (!secret) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'PAYSTACK_SECRET_KEY not configured' }) }
        if (String(secret).startsWith('pk_')) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Paystack public key detected; use secret key' }) }

        const vresp = await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackRef)}`, {
          headers: { Authorization: `Bearer ${String(secret).trim()}` },
          timeout: 10000
        })

        const vdata = vresp.data && (vresp.data.data || vresp.data)
        const status = vdata?.status || (vdata && vdata.data && vdata.data.status) || null
        if (!status || String(status).toLowerCase() !== 'success') {
          return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Paystack transaction not successful', detail: vdata }) }
        }

        // validate expected amount if caller provided `amount`
        if (body.amount && vdata.amount) {
          const expectedKobo = Math.round(Number(body.amount) * 100)
          const received = Number(vdata.amount)
          if (!isNaN(expectedKobo) && expectedKobo !== received) {
            return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Payment amount mismatch', expected: expectedKobo, received }) }
          }
        }

        // validate phone/email if Paystack returned customer metadata (best-effort)
        try {
          const payerPhone = String(vdata?.customer?.phone || vdata?.metadata?.phone || '').replace(/\D/g, '')
          const normalizedReqPhone = String(body.phoneNumber || '').replace(/\D/g, '')
          if (payerPhone && normalizedReqPhone && payerPhone !== normalizedReqPhone) {
            // don't proceed if Paystack customer phone doesn't match requested phone
            return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Paystack customer does not match requested phone number', paystack: payerPhone, request: normalizedReqPhone }) }
          }
        } catch (e) {
          // ignore metadata mismatches if parsing fails
        }

        // set in-progress lock
        processedRefs.set(idempotencyKey, { ts: Date.now(), lock: Date.now(), status: 202, response: { message: 'Processing purchase' } })

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
            console.warn('purchase-proxy: order-placed SMS failed', {
              recipient: smsResult.recipient || 'unknown',
              status: smsResult.status,
              error: smsResult.error
            })
          }
        }

        processedRefs.set(idempotencyKey, { ts: Date.now(), status: resp.status || 200, response: normalized })
        console.log('purchase-proxy: upstream response', { status: resp.status })
        return { statusCode: resp.status || 200, headers: CORS_HEADERS, body: JSON.stringify(normalized) }
      } catch (err) {
        // remove in-progress marker only if transient error; leave a short lock to prevent immediate dupes
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
        console.warn('purchase-proxy: order-placed SMS failed', {
          recipient: smsResult.recipient || 'unknown',
          status: smsResult.status,
          error: smsResult.error
        })
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
