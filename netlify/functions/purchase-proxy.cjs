const axios = require('axios')
// In-memory map to avoid duplicate processing within the same function instance
const processedRefs = new Map()
const CACHE_TTL = 5 * 60 * 1000 // keep recent responses for 5 minutes

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
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

    const normalizeNetwork = (net) => {
      if (!net) return net
      const s = String(net).toUpperCase()
      if (s === 'AT' || s.includes('AIRTEL') || s.includes('TIGO') || s.includes('AT_PREMIUM')) return 'AT_PREMIUM'
      if (s === 'MTN' || s === 'YELLO' || s.includes('YELLO')) return 'YELLO'
      if (s.includes('TELECEL')) return 'TELECEL'
      return s
    }

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

    const purchaseUrl = process.env.VITE_API_PURCHASE || process.env.API_PURCHASE || process.env.PURCHASE_URL || 'https://api.datamartgh.shop/api/developer/purchase'
    if (!purchaseUrl) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Purchase API URL not configured' }) }

    const secretApiKey = process.env.VITE_API_KEY || process.env.API_KEY || ''
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

    if (paystackRef) {
      const cached = processedRefs.get(paystackRef)
      if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
        return { statusCode: cached.status || 200, headers: CORS_HEADERS, body: JSON.stringify(cached.response) }
      }

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

        processedRefs.set(paystackRef, { ts: Date.now(), status: 202, response: { message: 'Processing purchase' } })

        headers['Idempotency-Key'] = paystackRef
        body.transactionReference = paystackRef

        const resp = await axios.post(purchaseUrl, body, { headers, timeout: 15000 })

        processedRefs.set(paystackRef, { ts: Date.now(), status: resp.status || 200, response: resp.data })
        console.log('purchase-proxy: upstream response', { status: resp.status })
        return { statusCode: resp.status || 200, headers: CORS_HEADERS, body: JSON.stringify(resp.data) }
      } catch (err) {
        processedRefs.delete(paystackRef)
        console.error('purchase-proxy paystack-verified error', err.message || err)
        const status = err.response && err.response.status || 500
        const data = err.response && err.response.data || { message: err.message }
        return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Purchase proxy failed', error: data }) }
      }
    }

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
