const axios = require('axios')

const JSON_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

const PRICE_CACHE_TTL_MS = 5 * 60 * 1000
let priceCache = { key: '', at: 0, data: null }

const hubnetBaseUrl = () => (
  process.env.HUBNET_BASE_URL ||
  process.env.VITE_HUBNET_BASE_URL ||
  'https://hubnetgh.site/wp-json/hubnet-api/v1'
)

const apiKey = () => (
  process.env.HUBNET_API_KEY ||
  process.env.VITE_API_KEY ||
  process.env.API_KEY ||
  ''
)

const hubnetNetworkMap = {
  MTN: 'mtn',
  AT: 'airteltigo',
  TELECEL: 'telecel'
}

const fallbackPriceMap = {
  MTN: {
    '1': 4.7,
    '2': 9.4,
    '3': 13.9,
    '4': 18.7,
    '5': 23.9,
    '6': 27.9,
    '8': 35.7,
    '10': 44.5,
    '15': 62.5
  },
  AT: [4.35, 8.95, 13.85, 17.7, 21, 24.7, 33.7, 41.7, 47.7, 57.7, 95.2, 115.2, 151.2, 190.2],
  TELECEL: [25, 40, 48, 55, 68, 85, 100, 120, 137, 157, 174, 195, 360]
}

const volumeMap = {
  MTN: ['1', '2', '3', '4', '5', '6', '8', '10', '15'],
  AT: Array.from({ length: 14 }, (_, i) => String(i + 1)),
  TELECEL: Array.from({ length: 13 }, (_, i) => String(i + 1))
}

exports.handler = async (event) => {
  try {
    const qp = event.queryStringParameters || {}
    const provider = (qp.provider || 'MTN').toUpperCase()
    const hubnetNetwork = hubnetNetworkMap[provider]
    const prices = fallbackPriceMap[provider]
    const volumes = volumeMap[provider]
    if (!hubnetNetwork || !prices || !volumes) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Unknown provider' }) }
    }

    const cacheKey = provider
    if (priceCache.data && priceCache.key === cacheKey && (Date.now() - priceCache.at) < PRICE_CACHE_TTL_MS) {
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(priceCache.data) }
    }

    const previewUrl = `${hubnetBaseUrl().replace(/\/$/, '')}/preview_order`
    const secretApiKey = apiKey()
    const headers = secretApiKey ? { 'X-API-KEY': secretApiKey, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
    const previewNumber = String(process.env.HUBNET_PREVIEW_NUMBER || '0240000000')

    const bundles = []
    for (let i = 0; i < volumes.length; i++) {
      const volume = volumes[i]
      const fallbackPrice = typeof prices === 'object' && !Array.isArray(prices)
        ? Number(prices[volume]) || 0
        : Number(prices[i]) || 0
      let resolvedPrice = fallbackPrice
      try {
        const previewResp = await axios.post(previewUrl, {
          network: hubnetNetwork,
          volume,
          quantity: 1,
          customer_number: previewNumber
        }, { headers, timeout: 9000 })

        const pdata = previewResp?.data || {}
        const maybeTotal = Number(pdata?.total || pdata?.data?.total || pdata?.amount || pdata?.data?.amount)
        if (!Number.isNaN(maybeTotal) && maybeTotal > 0) {
          resolvedPrice = maybeTotal
        }
      } catch {
        // keep fallback price when preview is unavailable
      }

      bundles.push({
        network: provider,
        dataAmount: `${volume} GB`,
        volume,
        price: Number(resolvedPrice.toFixed(2))
      })
    }

    priceCache = { key: cacheKey, at: Date.now(), data: bundles }

    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(bundles) }
  } catch (err) {
    console.error('packages proxy error', err?.response?.data || err.message)
    return { statusCode: err.response?.status || 500, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Failed to fetch packages', error: err.response?.data || err.message }) }
  }
}
