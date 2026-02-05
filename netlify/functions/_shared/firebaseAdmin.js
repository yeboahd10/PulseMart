const fs = require('fs')
const path = require('path')
let admin = null
let firestore = null

try {
  const adminLib = require('firebase-admin')

  // Initialize only once
  if (!adminLib.apps || adminLib.apps.length === 0) {
    const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    let serviceAccount = null

    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
      } catch (err) {
        serviceAccount = null
      }
    } else if (saPath) {
      const resolved = path.resolve(process.cwd(), saPath)
      try {
        serviceAccount = JSON.parse(fs.readFileSync(resolved, 'utf8'))
      } catch (err) {
        try { serviceAccount = require(resolved) } catch (err2) { serviceAccount = null }
      }
    }

    if (serviceAccount) {
      adminLib.initializeApp({ credential: adminLib.credential.cert(serviceAccount) })
      firestore = adminLib.firestore()
      console.log('firebase-admin initialized using provided service account')
    } else {
      console.log('No service account provided — firebase-admin not initialized (local file fallback removed)')
    }
  } else {
    firestore = adminLib.firestore()
  }

  admin = adminLib
} catch (err) {
  // firebase-admin might be absent in some environments — fail gracefully
  console.warn('firebase-admin init skipped:', err && err.message)
}

module.exports = { admin, firestore }
