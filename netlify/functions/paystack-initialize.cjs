67const axios = require('axios');

const _sanitize = (s) => s ? String(s).trim().replace(/^Bearer\s+/i, '').replace(/^"|"$/g, '') : undefined;

const JSON_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  try {
    console.log('paystack-initialize invoked', { method: event.httpMethod, path: event.path })
    const body = event.body ? JSON.parse(event.body) : {};
    const { amount, email, callback_url, currency, channels, reference, metadata } = body || {};
    if (!amount || !email) return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Missing amount or email' }) };

    const secret = _sanitize(process.env.PAYSTACK_SECRET_KEY);
    if (!secret) return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Paystack secret key not configured. Set PAYSTACK_SECRET_KEY in Netlify environment variables' }) };
    if (String(secret).startsWith('pk_')) return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Paystack public key detected (pk_...). Use the secret key (sk_test_... or sk_live_...) in PAYSTACK_SECRET_KEY' }) };

    const amountInKobo = String(Math.round(Number(amount) * 100));
    const payload = { email, amount: amountInKobo };
    if (channels) payload.channels = channels;
    if (currency) payload.currency = currency;
    if (reference) payload.reference = reference;
    if (callback_url) payload.callback_url = callback_url;
    if (metadata) payload.metadata = metadata;

    const response = await axios.post('https://api.paystack.co/transaction/initialize', payload, {
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      timeout: 10000
    });

    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(response.data) };
  } catch (err) {
    console.error('Paystack init error', {
      status: err.response?.status,
      data: err.response?.data,
      message: err.message
    });
    if (err.response?.status === 401) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Unauthorized: invalid Paystack secret key. Ensure PAYSTACK_SECRET_KEY is your secret (sk_test_... or sk_live_...)', error: err.response?.data }) };
    }
    return { statusCode: err.response?.status || 500, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Paystack init failed', error: err.response?.data || err.message }) };
  }
};
