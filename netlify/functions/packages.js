const JSON_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

const BUNDLE_CATALOG = {
  MTN: [4.7, 9.4, 13.9, 18.7, 23.9, 27.9, 35.7, 44.5, 62.5, 83, 105, 129, 166, 207, 407],
  AT: [4.35, 8.95, 13.85, 17.7, 21, 24.7, 33.7, 41.7, 47.7, 57.7, 95.2, 115.2, 151.2, 190.2],
  TELECEL: [25, 40, 48, 55, 68, 85, 100, 120, 137, 157, 174, 195, 360]
}

const buildBundles = (provider) => (
  (BUNDLE_CATALOG[provider] || []).map((price, index) => {
    const sizeGb = index + 1
    return {
      network: provider,
      dataAmount: `${sizeGb} GB`,
      volume: String(sizeGb * 1000),
      price: Number(price.toFixed(2))
    }
  })
)

exports.handler = async (event) => {
  try {
    const qp = event.queryStringParameters || {}
    const provider = (qp.provider || 'MTN').toUpperCase()
    const bundles = buildBundles(provider)

    if (!bundles.length) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Unknown provider' }) }
    }

    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(bundles) }
  } catch (err) {
    console.error('packages proxy error', err?.message || err)
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Failed to build packages', error: err?.message || 'Unknown error' }) }
  }
}
