const axios = require('axios')
const crypto = require('crypto')
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

    // normalize and validate incoming purchase payload to match DataMart API expectations
    const normalizeNetwork = (net) => {
      if (!net) return net
      const s = String(net).toUpperCase()
      if (s === 'AT' || s.includes('AIRTEL') || s.includes('TIGO') || s.includes('AT_PREMIUM')) return 'AT_PREMIUM'
      if (s === 'MTN' || s === 'YELLO' || s.includes('YELLO')) return 'YELLO'
      if (s.includes('TELECEL')) return 'TELECEL'
      return s
    }

    // ensure required fields exist and are in the expected format
    const phoneNumber = body.phoneNumber || body.phone || body.msisdn || ''
    let network = body.network || body.net || ''
    let capacity = body.capacity || body.size || body.data || ''

    // coerce capacity to numeric GB string (e.g. '5')
    capacity = String(capacity || '').replace(/[^0-9]/g, '')
    network = normalizeNetwork(network)

    if (!phoneNumber || !network || !capacity) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Missing required fields: phoneNumber, network, capacity' }) }
    }

    // replace body fields with normalized values we will forward upstream
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

    const purchaseUrl = process.env.VITE_API_PURCHASE || process.env.API_PURCHASE || process.env.PURCHASE_URL || 'https://api.datamartgh.shop/api/developer/purchase'
    if (!purchaseUrl) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Purchase API URL not configured' }) }

    const secretApiKey = process.env.VITE_API_KEY || process.env.API_KEY || ''
    const headers = { 'Content-Type': 'application/json' }
    if (secretApiKey) headers['X-API-Key'] = secretApiKey

    // Diagnostic logging (avoid printing secrets)
    console.log('purchase-proxy: forwarding request', {
      method: event.httpMethod,
      path: event.path,
      purchaseUrl,
      hasApiKey: !!secretApiKey,
      bodySample: typeof body === 'object' ? JSON.stringify(body).slice(0, 1000) : String(body)
    })

    // If caller provided a Paystack transaction reference, verify it first and apply idempotency
    const paystackRef = String(body.paystackReference || body.reference || body.transactionReference || body.tx_ref || body.paymentReference || '').trim() || null

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

        // attach idempotency header and transaction reference to upstream
        headers['Idempotency-Key'] = idempotencyKey
        body.transactionReference = paystackRef

        const resp = await axios.post(purchaseUrl, body, { headers, timeout: 15000 })

        // cache successful response
        processedRefs.set(idempotencyKey, { ts: Date.now(), status: resp.status || 200, response: resp.data })
        console.log('purchase-proxy: upstream response', { status: resp.status })
        return { statusCode: resp.status || 200, headers: CORS_HEADERS, body: JSON.stringify(resp.data) }
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

    // No paystack reference provided — just forward
    const resp = await axios.post(purchaseUrl, body, { headers, timeout: 15000 })

    console.log('purchase-proxy: upstream response', { status: resp.status })

    return { statusCode: resp.status || 200, headers: CORS_HEADERS, body: JSON.stringify(resp.data) }
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
