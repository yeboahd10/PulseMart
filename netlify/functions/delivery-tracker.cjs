const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }

    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ message: 'Method not allowed' }) }
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        message: 'Delivery tracker is not supported by Hubnet API',
        data: {
          scanner: null,
          stats: null,
          lastDelivered: null,
          checkingNow: null,
          yourOrders: [],
          lastCheckedAt: new Date().toISOString(),
          message: 'Delivery tracker is not supported by Hubnet API'
        },
        normalized: {
          scanner: null,
          stats: null,
          lastDelivered: null,
          checkingNow: null,
          yourOrders: [],
          message: 'Delivery tracker is not supported by Hubnet API'
        }
      })
    }
  } catch (err) {
    const status = 500
    const data = { message: err.message }
    return {
      statusCode: status,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'Delivery tracker lookup failed', error: data })
    }
  }
}
