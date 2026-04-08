const { sendDepositSms } = require('./_shared/arkesel-sms.cjs')

const JSON_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Method not allowed' }) }
    }

    const body = event.body ? JSON.parse(event.body) : {}
    const { to, userName, amount, newBalance } = body

    // Validate required fields
    if (!to) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Missing phone number (to)' }) }
    }
    if (!userName) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Missing userName' }) }
    }
    if (amount === undefined || amount === null) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Missing amount' }) }
    }
    if (newBalance === undefined || newBalance === null) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Missing newBalance' }) }
    }

    console.log('Sending deposit SMS', { to, userName, amount, newBalance })

    const result = await sendDepositSms({ to, userName, amount, newBalance })

    if (result.ok) {
      return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ ok: true, message: 'SMS sent successfully', data: result }) }
    } else {
      return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ ok: false, message: 'Failed to send SMS', error: result.error, data: result }) }
    }
  } catch (err) {
    console.error('deposit-notify error', err)
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ message: 'Internal server error', error: err.message }) }
  }
}
