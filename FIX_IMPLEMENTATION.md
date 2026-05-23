# Implementation Guide: Fixing Payment Verification Bypass

## Overview
This guide provides step-by-step fixes to prevent orders from bypassing Paystack payment verification.

---

## FIX 1: Require Server-Side Balance Verification in purchase-proxy.js

### What's Missing
Currently, `purchase-proxy.js` only verifies Paystack transactions. For wallet purchases (when user has balance), there's NO server-side verification.

### Implementation

**Step 1: Add Firebase Admin SDK import to purchase-proxy.js**
```javascript
const admin = require('firebase-admin');
const { credential } = require('firebase-admin');

// At the top of the file, initialize if not already done
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'puls-2024',
    databaseURL: process.env.FIREBASE_DB_URL || 'https://puls-2024.firebaseio.com'
  });
}
const db = admin.firestore();
```

**Step 2: Add authentication token verification function**
```javascript
const verifyAuthToken = async (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header' };
  }

  const token = authHeader.substring(7);
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return { uid: decodedToken.uid, email: decodedToken.email };
  } catch (err) {
    return { error: `Token verification failed: ${err.message}` };
  }
};
```

**Step 3: Add server-side balance check function**
```javascript
const getAndVerifyBalance = async (uid, requiredAmount) => {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists()) {
      return { error: 'User document not found', balance: 0 };
    }

    const data = userDoc.data() || {};
    const balance = Number(data.balance ?? data.wallet ?? 0);

    // Verify balance is sufficient
    if (balance < requiredAmount) {
      return {
        error: 'Insufficient balance',
        balance: balance,
        required: requiredAmount,
        shortfall: requiredAmount - balance
      };
    }

    return { balance, sufficient: true };
  } catch (err) {
    return { error: `Balance check failed: ${err.message}` };
  }
};
```

**Step 4: Add idempotent balance deduction function**
```javascript
const deductBalanceAtomic = async (uid, amount, purchaseRef) => {
  try {
    const userRef = db.collection('users').doc(uid);

    return await db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) {
        throw new Error('User not found during balance deduction');
      }

      const currentBalance = Number(userSnap.data().balance ?? 0);
      if (currentBalance < amount) {
        throw new Error('Insufficient balance at deduction time');
      }

      const newBalance = currentBalance - amount;

      // Update balance and record the deduction
      transaction.update(userRef, {
        balance: newBalance,
        lastPurchaseAt: admin.firestore.FieldValue.serverTimestamp(),
        lastPurchaseRef: purchaseRef
      });

      // Log the transaction for audit trail
      transaction.set(db.collection('balance_transactions').doc(), {
        userId: uid,
        type: 'deduction',
        amount: amount,
        newBalance: newBalance,
        purchaseRef: purchaseRef,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      return { success: true, newBalance };
    });
  } catch (err) {
    throw new Error(`Balance deduction failed: ${err.message}`);
  }
};
```

**Step 5: Modify the handler to enforce authentication for wallet purchases**
```javascript
exports.handler = async (event) => {
  // ... existing CORS/preflight handling ...

  const body = event.body ? JSON.parse(event.body) : {};
  const gateway = body.gateway || 'paystack';

  // For WALLET purchases (no Paystack), require authentication
  if (gateway === 'wallet' || (!body.paystackReference && !body.reference)) {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;

    // Verify Firebase token
    const authResult = await verifyAuthToken(authHeader);
    if (authResult.error) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: authResult.error })
      };
    }

    const uid = authResult.uid;

    // Verify user ID in request matches authenticated user
    if (body.userId && body.userId !== uid) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: 'User ID mismatch' })
      };
    }

    // Query current balance server-side
    const displayPrice = Number(body.displayPrice || body.amount || 0);
    const balanceResult = await getAndVerifyBalance(uid, displayPrice);

    if (balanceResult.error) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          message: balanceResult.error,
          balance: balanceResult.balance,
          required: balanceResult.required
        })
      };
    }

    // Add auth token to metadata for later audit
    body.authenticatedUserId = uid;
  }

  // ... rest of existing code ...

  // When purchase is successful and uses wallet, deduct balance
  if (normalized.success && (gateway === 'wallet' || (!body.paystackReference))) {
    try {
      const deductResult = await deductBalanceAtomic(
        body.userId || body.authenticatedUserId,
        Number(body.displayPrice || body.amount || 0),
        normalized.orderReference || normalized.order_id
      );
      normalized.balanceDeducted = deductResult;
    } catch (err) {
      console.error('Balance deduction failed after purchase success:', err);
      // Critical error: order placed but balance not deducted
      normalized.error = 'Order placed but balance deduction failed';
      normalized.requiresManualAudit = true;
    }
  }

  return { statusCode: resp.status || 200, headers: CORS_HEADERS, body: JSON.stringify(normalized) };
};
```

---

## FIX 2: Client-Side Changes - Always Use Authenticated Requests

### In MTN.jsx, Telecel.jsx, and AT.jsx

**Replace the purchase call with authentication:**

```javascript
// Get Firebase ID token
const getAuthToken = async () => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return await user.getIdToken();
};

// Modified handleBuy function
const handleBuy = async () => {
  const b = bundles[selectedIndex];
  if (!b) return;
  setPlacing(true);

  if (!phone) {
    alert('Please enter a phone number');
    setPlacing(false);
    return;
  }

  const displayPrice = Number(b.price) || 0;
  const userBalance = Number(user?.balance ?? user?.wallet ?? 0);
  const accountName = String(user?.fullName || user?.name || user?.displayName || 'Customer').trim() || 'Customer';
  const accountPhone = String(user?.phoneNumber || user?.phone || '').trim();

  // ✓ Always check if payment is needed
  if (user && userBalance < displayPrice) {
    // Shortfall - use Paystack
    const shortfall = Number((displayPrice - userBalance).toFixed(2));
    const fee = Number((shortfall * 0.02).toFixed(2));
    const total = Number((shortfall + fee).toFixed(2));

    if (!user.email) {
      alert('Please ensure your account has an email before paying');
      setPlacing(false);
      return;
    }

    const capacity = String(b.volume || toHubnetVolume(b.dataAmount || b.capacity || ''));
    if (!capacity) {
      alert('Bundle volume not configured');
      setPlacing(false);
      return;
    }

    const initPayload = {
      amount: total,
      email: user.email,
      callback_url: `${window.location.origin}/paystack/callback`,
      metadata: {
        purchase: {
          phoneNumber: phone,
          network: mapNetwork(b.network),
          capacity: capacity,
          capacityLabel: b.dataAmount,
          displayPrice: displayPrice,
          accountName,
          accountPhone,
          userId: user?.uid ?? null,
          shortfall,
          fee
        }
      }
    };

    try {
      const { initPaystack } = await import('./utils/paystack');
      await initPaystack(initPayload);
    } catch (err) {
      alert(`Payment initialization failed: ${err.response?.data?.message || err.message}`);
      setPlacing(false);
    }

    setPlacing(false);
    return;
  }

  // Sufficient balance - use wallet with authentication
  const actualPrice = Number(b.apiPrice ?? b.price ?? 0);
  const capacity = String(b.volume || toHubnetVolume(b.dataAmount || b.capacity || ''));

  if (!capacity) {
    alert('Bundle volume not configured');
    setPlacing(false);
    return;
  }

  const payload = {
    phoneNumber: phone,
    network: mapNetwork(b.network),
    capacity,
    capacityLabel: b.dataAmount,
    accountName,
    accountPhone,
    userId: user?.uid ?? null,
    userName: accountName,
    gateway: 'wallet',
    displayPrice: displayPrice,
    amount: actualPrice
  };

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;

  // ✓ Add Firebase auth token
  try {
    const authToken = await getAuthToken();
    headers['Authorization'] = `Bearer ${authToken}`;
  } catch (err) {
    alert('Authentication failed. Please log in again.');
    setPlacing(false);
    return;
  }

  axios
    .post(purchaseUrl, payload, { headers })
    .then(async (res) => {
      console.log('Purchase response:', res.data);
      const resp = res.data || {};
      const success = resp?.status === 'success' || resp?.success === true || resp?.order_status === 'success' || resp?.data?.status === 'success';

      if (success) {
        const purchaseId = resp?.purchaseId || resp?.id || resp?.data?.id || resp?.transactionId || resp?.txId || null;
        const transactionReference = resp?.transactionReference || resp?.transaction_ref || resp?.tx_ref || resp?.reference || resp?.data?.transactionReference || null;
        const orderReference = resp?.orderReference || resp?.order_reference || resp?.order_id || resp?.data?.orderReference || resp?.data?.order_reference || resp?.data?.order_id || transactionReference || purchaseId || null;

        setSuccessInfo({ purchaseId, transactionReference });

        try {
          // Save purchase to Firestore
          const purchaseDoc = await addDoc(collection(db, 'purchases'), {
            userId: user?.uid ?? null,
            purchaseId,
            orderReference,
            transactionReference: transactionReference || purchaseId || resp?.data?.reference || resp?.data?.transactionReference || resp?.data?.id || '',
            rawResponse: resp,
            network: b.network,
            phoneNumber: phone,
            capacity: b.dataAmount,
            capacityLabel: b.dataAmount,
            accountName,
            accountPhone,
            price: actualPrice,
            displayPrice: Number(b.price) || 0,
            display_price: Number(b.price) || 0,
            localPrice: Number(b.price) || 0,
            createdAt: serverTimestamp(),
            // ✓ Add payment verification flag
            paymentVerified: true,
            paymentMethod: 'wallet'
          });

          console.log('Purchase saved:', purchaseDoc.id);
        } catch (err) {
          console.error('Failed saving purchase', err);
          // Don't show error to user since order was already placed
        }

        // ✓ Show success ONLY after purchase is saved
        setSuccessModalOpen(true);
        setPlacing(false);
        setModalOpen(false);
      } else {
        alert('Purchase request was not successful. Please try again.');
        setPlacing(false);
      }
    })
    .catch((err) => {
      console.error('Purchase error:', err);
      const message = err.response?.data?.message || err.message || 'Purchase failed';
      alert(`Purchase failed: ${message}`);
      setPlacing(false);
    });
};
```

### Import needed at top of files:
```javascript
import { getAuth } from 'firebase/auth'
```

---

## FIX 3: Update PaystackCallback to Handle Balance Better

In [PaystackCallback.jsx](PaystackCallback.jsx#L50-L75):

```javascript
// Calculate credit amount with better logic
let creditAmount = amountGhs;
try {
  const meta = tx.metadata || {};
  
  // For purchase flows with shortfall
  if (meta.purchase?.shortfall && !isNaN(Number(meta.purchase.shortfall))) {
    creditAmount = Number(meta.purchase.shortfall);
  }
  // For top-ups
  else if (meta.originalAmount && !isNaN(Number(meta.originalAmount))) {
    creditAmount = Number(meta.originalAmount);
  }
  // Fallback: use full amount
  else {
    creditAmount = amountGhs;
  }
} catch (e) {
  console.warn('Failed to parse metadata, using full amount', e);
  creditAmount = amountGhs;
}

// Ensure we don't credit more than paid
creditAmount = Math.min(Number(creditAmount) || 0, amountGhs);

// ✓ Use atomic transaction for credit
await runTransaction(db, async (tx) => {
  const userSnap = await tx.get(userRef);
  const currentBalance = Number(userSnap.data()?.balance ?? 0);
  const newBalance = currentBalance + creditAmount;

  tx.update(userRef, {
    balance: newBalance,
    lastTopUpAt: serverTimestamp(),
    lastPaystackRef: reference
  });

  // Log transaction
  tx.set(collection(db, 'balance_transactions').doc(), {
    userId: userSnap.id,
    type: 'credit',
    amount: creditAmount,
    newBalance: newBalance,
    paystackRef: reference,
    timestamp: serverTimestamp()
  });
});
```

---

## FIX 4: Add Request Deduplication

Update purchase-proxy.js to prevent duplicate processing:

```javascript
// Maintain a distributed cache of recent purchases (use Redis in production)
const recentPurchases = new Map();
const DEDUP_TTL = 30 * 1000; // 30 seconds

const isDuplicatePurchase = (phone, network, capacity, userId) => {
  const key = `${userId}:${phone}:${network}:${capacity}`;
  const now = Date.now();
  
  if (recentPurchases.has(key)) {
    const lastPurchase = recentPurchases.get(key);
    if (now - lastPurchase < DEDUP_TTL) {
      return true; // Duplicate within 30 seconds
    }
  }
  
  recentPurchases.set(key, now);
  
  // Clean old entries
  for (const [k, v] of recentPurchases.entries()) {
    if (now - v > DEDUP_TTL * 2) {
      recentPurchases.delete(k);
    }
  }
  
  return false;
};

// In the handler, after receiving request:
if (isDuplicatePurchase(phoneNumber, network, capacity, body.userId)) {
  return {
    statusCode: 409,
    headers: CORS_HEADERS,
    body: JSON.stringify({ message: 'Duplicate purchase attempt detected' })
  };
}
```

---

## FIX 5: Add Comprehensive Logging

Create a new function to log all purchase attempts:

```javascript
const logPurchaseAttempt = async (details) => {
  try {
    await db.collection('purchase_log').add({
      ...details,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Failed to log purchase attempt:', err);
  }
};

// Call this in the purchase-proxy handler:
await logPurchaseAttempt({
  userId: body.userId || body.authenticatedUserId,
  phoneNumber: phoneNumber,
  network: network,
  capacity: capacity,
  gateway: body.gateway,
  displayPrice: body.displayPrice,
  status: normalized.status,
  orderReference: normalized.orderReference,
  authenticatedUserId: body.authenticatedUserId || null,
  balanceVerified: !!body.authenticatedUserId
});
```

---

## DEPLOYMENT CHECKLIST

- [ ] Update `purchase-proxy.js` with server-side balance verification
- [ ] Update `MTN.jsx`, `Telecel.jsx`, `AT.jsx` with auth tokens
- [ ] Update `PaystackCallback.jsx` with atomic transactions
- [ ] Test wallet purchases with valid balance
- [ ] Test wallet purchases with insufficient balance
- [ ] Test rapid concurrent purchases
- [ ] Verify Paystack flow still works
- [ ] Check Firestore balance updates correctly
- [ ] Monitor error logs for balance deduction failures
- [ ] Test with production-like data volumes
- [ ] Add monitoring alerts for failed balance deductions

---

## MONITORING AFTER DEPLOYMENT

Create a Firestore security rule to prevent direct balance updates:

```
match /users/{userId} {
  allow read: if request.auth.uid == userId;
  allow write: if request.auth.uid == userId && 
               request.resource.data.balance == resource.data.balance;  
  // Prevent balance updates except through functions
}
```

Add alerts in Netlify for:
- High rate of failed balance deductions
- Multiple purchases from same user in <10 seconds
- Purchases without `authenticatedUserId`
- Balance mismatch errors

