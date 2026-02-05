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

    if (saPath) {
      const resolved = path.resolve(process.cwd(), saPath)
      try {
        serviceAccount = JSON.parse(fs.readFileSync(resolved, 'utf8'))
      } catch (err) {
        try { serviceAccount = require(resolved) } catch (err2) { serviceAccount = null }
      }
    }

    // fallback to repo-root file name if present
    if (!serviceAccount) {
      const fallback = path.resolve(process.cwd(), 'pulsemart-1d11e-firebase-adminsdk-fbsvc-11c2793397.json')
      if (fs.existsSync(fallback)) {
        serviceAccount = JSON.parse(fs.readFileSync(fallback, 'utf8'))
      }
    }

    if (serviceAccount) {
      adminLib.initializeApp({ credential: adminLib.credential.cert(serviceAccount) })
      firestore = adminLib.firestore()
      console.log('firebase-admin initialized using service account')
    } else {
      console.log('FIREBASE_SERVICE_ACCOUNT_PATH not set or file not found — firebase-admin not initialized')
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
