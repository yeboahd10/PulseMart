const axios = require('axios')

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

    // Forward the request to the upstream purchase API
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
