const JSON_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

// firebase-admin integration removed

// Webhook has been removed — keep a no-op handler so incoming requests are acknowledged but not processed.
exports.handler = async (event) => {
  return {
    statusCode: 410,
    headers: JSON_HEADERS,
    body: JSON.stringify({ message: 'Webhook handler removed' })
  }
}
