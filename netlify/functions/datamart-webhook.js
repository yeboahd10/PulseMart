/* eslint-env node */
/* global require, process, exports */
const crypto = require('crypto')
const { FieldValue, getDb } = require('./_shared/firebase-admin.cjs')

const JSON_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-DataMart-Signature, X-DataMart-Event',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
}

const resolveSecret = () => (
  process.env.DATAMART_WEBHOOK_SECRET ||
  process.env.DATAMART_WEBHOOK_SIGNING_SECRET ||
  ''
)

const readHeader = (headers, name) => {
  const lowerName = String(name || '').toLowerCase()
  const entries = Object.entries(headers || {})
  const found = entries.find(([key]) => String(key || '').toLowerCase() === lowerName)
  return found ? found[1] : undefined
}

const getRawBody = (event) => {
  if (!event.body) return ''
  if (event.isBase64Encoded) return Buffer.from(event.body, 'base64').toString('utf8')
  return String(event.body)
}

const verifySignature = (rawBody, signature, secret) => {
  if (!signature || !secret) return false
  const provided = String(signature).trim().toLowerCase()
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex').toLowerCase()
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  if (providedBuffer.length !== expectedBuffer.length) return false
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer)
}

const normalizeStatus = (value) => {
  const s = String(value || '').trim().toLowerCase()
  if (!s) return 'pending'
  if (s === 'delivered' || s === 'success' || s === 'sent') return 'completed'
  if (s === 'queued' || s === 'waiting') return 'waiting'
  if (s === 'error') return 'failed'
  return s
}

const buildEventId = (payload) => crypto
  .createHash('sha1')
  .update(JSON.stringify({
    event: payload.event || '',
    timestamp: payload.timestamp || '',
    orderReference: payload.data?.orderReference || payload.data?.reference || '',
    transactionId: payload.data?.transactionId || payload.data?.transactionReference || '',
    status: payload.data?.status || payload.data?.orderStatus || ''
  }))
  .digest('hex')

const findPurchaseDoc = async (db, orderReference, transactionReference) => {
  const purchases = db.collection('purchases')
  const attempts = []

  if (orderReference) {
    attempts.push(purchases.where('orderReference', '==', orderReference).limit(1).get())
    attempts.push(purchases.where('rawResponse.data.orderReference', '==', orderReference).limit(1).get())
    attempts.push(purchases.where('rawResponse.orderReference', '==', orderReference).limit(1).get())
  }

  if (transactionReference) {
    attempts.push(purchases.where('transactionReference', '==', transactionReference).limit(1).get())
  }

  for (const pending of attempts) {
    const snap = await pending
    if (!snap.empty) return snap.docs[0]
  }

  return null
}

const findPaystackMarker = async (db, orderReference, transactionReference) => {
  const markers = db.collection('paystack_callbacks')
  const attempts = []

  if (orderReference) {
    attempts.push(markers.where('purchaseResponse.data.orderReference', '==', orderReference).limit(1).get())
    attempts.push(markers.where('purchaseResponse.orderReference', '==', orderReference).limit(1).get())
  }

  if (transactionReference) {
    attempts.push(markers.where('purchaseResponse.data.transactionReference', '==', transactionReference).limit(1).get())
    attempts.push(markers.where('purchaseResponse.transactionReference', '==', transactionReference).limit(1).get())
  }

  for (const pending of attempts) {
    const snap = await pending
    if (!snap.empty) return snap.docs[0]
  }

  return null
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: JSON_HEADERS, body: '' }
    }

    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({ ok: true, configured: Boolean(resolveSecret()) })
      }
    }

    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Method not allowed' }) }
    }

    const secret = resolveSecret()
    if (!secret) {
      return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Datamart webhook secret not configured' }) }
    }

    const rawBody = getRawBody(event)
    if (!rawBody) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Missing request body' }) }
    }

    const signature = readHeader(event.headers, 'x-datamart-signature')
    if (!verifySignature(rawBody, signature, secret)) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Invalid webhook signature' }) }
    }

    const payload = JSON.parse(rawBody)
    const data = payload.data || {}
    const db = getDb()

    const eventId = buildEventId(payload)
    const eventRef = db.collection('datamart_webhook_events').doc(eventId)
    const existingEvent = await eventRef.get()
    if (existingEvent.exists) {
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ received: true, duplicate: true }) }
    }

    const eventName = String(payload.event || readHeader(event.headers, 'x-datamart-event') || '').trim()
    const orderReference = String(data.orderReference || data.reference || '').trim()
    const transactionReference = String(data.transactionId || data.transactionReference || '').trim()
    const orderStatus = normalizeStatus(data.status || data.orderStatus || eventName.replace('order.', ''))

    let purchaseDoc = await findPurchaseDoc(db, orderReference, transactionReference)
    let markerDoc = null

    if (!purchaseDoc) {
      markerDoc = await findPaystackMarker(db, orderReference, transactionReference)
      const purchaseDocId = markerDoc?.get('purchaseDocId')
      if (purchaseDocId) {
        const candidate = await db.collection('purchases').doc(String(purchaseDocId)).get()
        if (candidate.exists) purchaseDoc = candidate
      }
    }

    const purchaseUpdate = {
      orderReference: orderReference || null,
      transactionReference: transactionReference || null,
      orderStatus,
      status: orderStatus,
      statusSource: 'webhook',
      webhookEvent: eventName || null,
      datamartOrderId: data.orderId || null,
      datamartUpdatedAt: data.updatedAt || null,
      datamartCreatedAt: data.createdAt || null,
      datamartWebhookAt: payload.timestamp || null,
      lastStatusSyncAt: FieldValue.serverTimestamp(),
      lastWebhookPayload: payload,
      phoneNumber: data.phone || undefined,
      network: data.network || undefined,
      capacity: data.capacity != null ? String(data.capacity) : undefined,
      price: typeof data.price === 'number' ? data.price : undefined
    }

    Object.keys(purchaseUpdate).forEach((key) => {
      if (purchaseUpdate[key] === undefined) delete purchaseUpdate[key]
    })

    if (purchaseDoc) {
      await purchaseDoc.ref.set(purchaseUpdate, { merge: true })
    }

    if (markerDoc) {
      await markerDoc.ref.set({
        lastWebhookEvent: eventName || null,
        lastWebhookStatus: orderStatus,
        lastWebhookAt: FieldValue.serverTimestamp(),
        lastWebhookPayload: payload
      }, { merge: true })
    }

    await eventRef.set({
      event: eventName || null,
      orderReference: orderReference || null,
      transactionReference: transactionReference || null,
      orderStatus,
      matchedPurchaseId: purchaseDoc?.id || null,
      matchedMarkerId: markerDoc?.id || null,
      receivedAt: FieldValue.serverTimestamp(),
      payload
    }, { merge: true })

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        received: true,
        orderReference,
        orderStatus,
        matched: Boolean(purchaseDoc),
        purchaseId: purchaseDoc?.id || null
      })
    }
  } catch (err) {
    console.error('datamart-webhook error', err)
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ message: 'Webhook processing failed', error: err.message })
    }
  }
}
