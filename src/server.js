/* eslint-env node */
import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

// Log whether Paystack secret is available (masked) and sanitize
const _mask = (k) => { try { if (!k) return 'MISSING'; if (k.length <= 8) return '*'.repeat(k.length); return `${k.slice(0,4)}...${k.slice(-4)}` } catch { return 'ERROR' } }
const _rawSecret = process.env.PAYSTACK_SECRET_KEY
const _sanitizedSecret = _rawSecret ? String(_rawSecret).trim().replace(/^Bearer\s+/i, '').replace(/^"|"$/g, '') : undefined
console.log('Paystack secret (masked):', _mask(_sanitizedSecret))

const app = express();

// enable CORS and allow the X-API-Key header for preflight
app.use(cors({
  origin: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  exposedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));
app.use(express.json());

// Paystack initialize endpoint
app.post('/api/paystack/initialize', async (req, res) => {
  try {
    const { amount, email, callback_url, currency, channels, reference, metadata } = req.body || {}
    if (!amount || !email) return res.status(400).json({ message: 'Missing amount or email' })

    const secret = _sanitizedSecret
    if (!secret) return res.status(500).json({ message: 'Paystack secret key not configured. Set PAYSTACK_SECRET_KEY in .env' })
    if (String(secret).startsWith('pk_')) return res.status(500).json({ message: 'Paystack public key detected (pk_...). Use the secret key (sk_test_... or sk_live_...) in PAYSTACK_SECRET_KEY' })

    // prepare payload according to Paystack docs - amount must be in subunits (kobo) and sent as string
    const amountInKobo = String(Math.round(Number(amount) * 100))
    const payload = {
      email,
      amount: amountInKobo,
    }
    if (channels) payload.channels = channels
    if (currency) payload.currency = currency
    if (reference) payload.reference = reference
    if (callback_url) payload.callback_url = callback_url
    if (metadata) payload.metadata = metadata

    const response = await axios.post('https://api.paystack.co/transaction/initialize', payload, {
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      timeout: 10000
    })

    return res.status(200).json(response.data)
  } catch (err) {
      console.error('Paystack init error', {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message
      })
    if (err.response?.status === 401) {
      return res.status(401).json({ message: 'Unauthorized: invalid Paystack secret key. Ensure PAYSTACK_SECRET_KEY is your secret (sk_test_... or sk_live_...)', error: err.response?.data })
    }
    return res.status(err.response?.status || 500).json({ message: 'Paystack init failed', error: err.response?.data || err.message })
  }
})

// Paystack verify endpoint
app.post('/api/paystack/verify', async (req, res) => {
  try {
    const { reference } = req.body || {}
    if (!reference) return res.status(400).json({ message: 'Missing reference' })

    

    const secret = _sanitizedSecret
    if (!secret) return res.status(500).json({ message: 'Paystack secret key not configured. Set PAYSTACK_SECRET_KEY in .env' })
    if (String(secret).startsWith('pk_')) return res.status(500).json({ message: 'Paystack public key detected (pk_...). Use the secret key (sk_test_... or sk_live_...) in PAYSTACK_SECRET_KEY' })

    const response = await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: 'application/json'
      },
      timeout: 10000
    })

    // return Paystack verification payload to caller
    return res.status(200).json(response.data)
  } catch (err) {
      console.error('Paystack verify error', {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message
      })
    return res.status(err.response?.status || 500).json({ message: 'Paystack verify failed', error: err.response?.data || err.message })
  }
})

app.post("/api/purchase", async (req, res) => {
  const { phoneNumber, network, capacity } = req.body || {};

  console.log('Incoming /api/purchase', {
    headers: {
      'x-api-key': req.headers['x-api-key'] || req.headers['X-API-Key'] || null,
      authorization: req.headers['authorization'] || null,
    },
    body: req.body,
  });

  if (!phoneNumber || !network || !capacity) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const apiKey = process.env.HUBNET_API_KEY || process.env.VITE_API_KEY || process.env.API_KEY || '';
    const _mask = (k) => {
      if (!k) return 'MISSING';
      try { if (k.length <= 8) return '*'.repeat(k.length); return `${k.slice(0,4)}...${k.slice(-4)}` } catch (e) { return 'ERROR' }
    }
    console.log('Server resolved API key:', _mask(apiKey));

    const normalizeNetwork = (value) => {
      const s = String(value || '').toLowerCase()
      if (s.includes('mtn') || s.includes('yello')) return 'mtn'
      if (s.includes('telecel') || s.includes('vodafone')) return 'telecel'
      if (s.includes('airtel') || s.includes('tigo') || s === 'at' || s.includes('at_premium')) return 'airteltigo'
      return s
    }

    const requestId = `req_${Date.now()}`
    const response = await axios.post(
      `${String(process.env.HUBNET_BASE_URL || 'https://hubnetgh.site/wp-json/hubnet-api/v1').replace(/\/$/, '')}/place_order`,
      {
        customer_number: String(phoneNumber),
        network: normalizeNetwork(network),
        volume: String(capacity).replace(/[^0-9]/g, ''),
        quantity: 1,
        request_id: requestId
      },
      {
        headers: {
          "X-API-Key": apiKey
        }
      }
    );

    const payload = response.data || {}
    const success = payload.success === true || String(payload.status || '').toLowerCase() === 'success'
    const orderReference = String(payload.order_id || requestId)

    res.status(201).json({
      success,
      status: success ? 'success' : 'failed',
      message: payload.message || (success ? 'Order placed successfully' : 'Order placement failed'),
      orderReference,
      transactionReference: orderReference,
      data: {
        status: success ? 'success' : 'failed',
        orderStatus: success ? 'pending' : 'failed',
        orderReference,
        raw: payload
      }
    });
  } catch (error) {
    console.error('Purchase proxy error details:', {
      message: error.message,
      status: error.response?.status,
      responseData: error.response?.data,
      stack: error.stack,
    });
    return res.status(error.response?.status || 500).json({
      message: "Purchase failed",
      error: error.response?.data || error.message
    });
  }
});

app.listen(5000, () => {
  console.log("Backend running on http://localhost:5000");
});
