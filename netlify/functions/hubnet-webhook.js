/* eslint-env node */
/* global require, process, exports, Buffer */
const { FieldValue, getDb } = require('./_shared/firebase-admin.cjs')
const { sendArkeselSms } = require('./_shared/arkesel-sms.cjs')

const JSON_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
}

const getRawBody = (event) => {
  if (!event.body) return ''
  if (event.isBase64Encoded) return Buffer.from(event.body, 'base64').toString('utf8')
  return String(event.body)
}

// Hubnet sends no documented signature — we verify by checking the bearer token matches our API key
const verifyRequest = (event) => {
  const secret = process.env.HUBNET_WEBHOOK_SECRET || process.env.HUBNET_API_KEY || process.env.VITE_API_KEY_HUB || ''
  if (!secret) return true // no secret configured — accept all (log a warning)
  const authHeader = Object.entries(event.headers || {})
    .find(([k]) => k.toLowerCase() === 'authorization')?.[1] || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  return token === secret
}

const normalizeHubnetStatus = (payload) => {
  // Hubnet delivery webhook typically has status: true/false and an event/message field
  const isSuccess =
    payload?.status === true ||
    String(payload?.status || '').toLowerCase() === 'success' ||
    String(payload?.message || '').trim() === '0000' ||
    String(payload?.reason || '').toLowerCase() === 'successful' ||
    String(payload?.event || '').toLowerCase().includes('success') ||
    String(payload?.delivery_status || '').toLowerCase() === 'delivered'

  const isFailed =
    payload?.status === false ||
    String(payload?.event || '').toLowerCase().includes('fail') ||
    String(payload?.delivery_status || '').toLowerCase() === 'failed'

  if (isSuccess) return 'completed'
  if (isFailed) return 'failed'
  return 'processing'
}

// Format raw MB capacity into a readable label (e.g. 1000 → 1GB, 500 → 500MB)
const formatDataLabel = (capacityLabel, capacity) => {
  const label = String(capacityLabel || '').trim()
  if (/[a-zA-Z]/.test(label)) return label
  const mb = Number(String(capacity || label || '').replace(/\D/g, ''))
  if (!mb) return label || 'data bundle'
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024}GB`
  if (mb >= 1000) return `${(mb / 1000).toFixed(mb % 1000 === 0 ? 0 : 1)}GB`
  return `${mb}MB`
}

const findPurchaseDoc = async (db, reference, transactionId, paymentId) => {
  const purchases = db.collection('purchases')

  const queries = []
  if (reference) {
    queries.push(purchases.where('orderReference', '==', reference).limit(1).get())
    queries.push(purchases.where('transactionReference', '==', reference).limit(1).get())
  }
  if (transactionId) {
    queries.push(purchases.where('transactionReference', '==', transactionId).limit(1).get())
  }
  if (paymentId) {
    queries.push(purchases.where('transactionReference', '==', paymentId).limit(1).get())
  }

  for (const q of queries) {
    const snap = await q
    if (!snap.empty) return snap.docs[0]
  }
  return null
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: JSON_HEADERS, body: '' }
    }

    // Health check
    if (event.httpMethod === 'GET') {
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true, function: 'hubnet-webhook' }) }
    }

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Method not allowed' }) }
    }

    if (!verifyRequest(event)) {
      console.warn('hubnet-webhook: unauthorized request')
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Unauthorized' }) }
    }

    const rawBody = getRawBody(event)
    if (!rawBody) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Missing body' }) }
    }

    let payload
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Invalid JSON' }) }
    }

    console.log('hubnet-webhook: received payload', JSON.stringify(payload).slice(0, 500))

    // Extract all possible reference identifiers from Hubnet callback
    const reference = String(payload?.reference || payload?.data?.reference || '').trim()
    const transactionId = String(payload?.transaction_id || payload?.data?.transaction_id || '').trim()
    const paymentId = String(payload?.payment_id || payload?.data?.payment_id || '').trim()

    if (!reference && !transactionId && !paymentId) {
      console.warn('hubnet-webhook: no reference identifiers in payload')
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ received: true, skipped: 'no reference' }) }
    }

    const orderStatus = normalizeHubnetStatus(payload)
    console.log('hubnet-webhook: resolved status', { reference, transactionId, paymentId, orderStatus })

    let db
    try {
      db = getDb()
    } catch (e) {
      console.error('hubnet-webhook: Firebase not configured', e.message)
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ received: true, warning: 'Firebase not configured' }) }
    }

    const purchaseDoc = await findPurchaseDoc(db, reference, transactionId, paymentId)

    if (!purchaseDoc) {
      console.warn('hubnet-webhook: no matching purchase found', { reference, transactionId, paymentId })
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ received: true, matched: false }) }
    }

    await purchaseDoc.ref.set({
      orderStatus,
      status: orderStatus,
      statusSource: 'hubnet_webhook',
      hubnetWebhookAt: new Date().toISOString(),
      hubnetWebhookPayload: payload,
      lastStatusSyncAt: FieldValue.serverTimestamp()
    }, { merge: true })

    console.log('hubnet-webhook: updated purchase', purchaseDoc.id, '->', orderStatus)

    // Send delivery SMS when order is confirmed completed
    if (orderStatus === 'completed') {
      try {
        const data = purchaseDoc.data()
        const to = data.accountPhone || data.phoneNumber || ''
        const accountName = String(data.accountName || 'Customer').trim()
        const network = String(data.network || '').toUpperCase()
        const dataLabel = formatDataLabel(data.capacityLabel, data.capacity)
        const recipientPhone = data.phoneNumber || to

        if (to) {
          const networkPart = network ? ` ${network}` : ''
          const message = `Hi ${accountName}, your ${dataLabel}${networkPart} data bundle has been delivered successfully to ${recipientPhone}. Thank you for using Pulsemart!`
          const smsResult = await sendArkeselSms({ to, message })
          console.log('hubnet-webhook: delivery SMS', smsResult.ok ? 'sent' : 'failed', { to: smsResult.recipient, status: smsResult.status })
        } else {
          console.warn('hubnet-webhook: no phone number on purchase doc, skipping delivery SMS')
        }
      } catch (smsErr) {
        console.error('hubnet-webhook: delivery SMS error', smsErr.message)
      }
    }

    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ received: true, matched: true, status: orderStatus }) }
  } catch (err) {
    console.error('hubnet-webhook: error', err)
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Internal server error', error: err.message }) }
  }
}
