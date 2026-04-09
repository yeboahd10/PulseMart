const JSON_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

const BUNDLE_CATALOG = {
  MTN: [
    { volume: '1', price: 4.7 },
    { volume: '2', price: 9.4 },
    { volume: '3', price: 13.9 },
    { volume: '4', price: 18.7 },
    { volume: '5', price: 23.9 },
    { volume: '6', price: 27.9 },
    { volume: '8', price: 35.7 },
    { volume: '10', price: 44.5 },
    { volume: '15', price: 62.5 }
  ],
  AT: [4.35, 8.95, 13.85, 17.7, 21, 24.7, 33.7, 41.7, 47.7, 57.7, 95.2, 115.2, 151.2, 190.2],
  TELECEL: [25, 40, 48, 55, 68, 85, 100, 120, 137, 157, 174, 195, 360]
}

const buildBundles = (provider) => (
  (BUNDLE_CATALOG[provider] || []).map((entry, index) => {
    const isObjectEntry = typeof entry === 'object' && entry !== null
    const sizeGb = isObjectEntry ? String(entry.volume) : String(index + 1)
    const price = isObjectEntry ? Number(entry.price) : Number(entry)
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
