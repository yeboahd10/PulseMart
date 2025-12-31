const axios = require('axios');

const _sanitize = (s) => s ? String(s).trim().replace(/^Bearer\s+/i, '').replace(/^"|"$/g, '') : undefined;

const JSON_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { reference } = body || {};
    if (!reference) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Missing reference' }) };

    const secret = _sanitize(process.env.PAYSTACK_SECRET_KEY);
    if (!secret) return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Paystack secret key not configured. Set PAYSTACK_SECRET_KEY in Netlify environment variables' }) };
    if (String(secret).startsWith('pk_')) return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Paystack public key detected (pk_...). Use the secret key (sk_test_... or sk_live_...) in PAYSTACK_SECRET_KEY' }) };

    const response = await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: 'application/json'
      },
      timeout: 10000
    });

    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(response.data) };
  } catch (err) {
    console.error('Paystack verify error', {
      status: err.response?.status,
      data: err.response?.data,
      message: err.message
    });
    return { statusCode: err.response?.status || 500, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Paystack verify failed', error: err.response?.data || err.message }) };
  }
};
