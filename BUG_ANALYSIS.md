# Critical Bug Analysis: Orders Bypassing Payment Verification

## Summary
Orders are sometimes going through WITHOUT Paystack payment and verification when users have sufficient wallet balance. This creates revenue loss and fraud vulnerabilities.

---

## ROOT CAUSES IDENTIFIED

### 🔴 **ROOT CAUSE 1: No Payment Verification for Wallet Purchases**

**Location:** [MTN.jsx](MTN.jsx#L65-L85), [Telecel.jsx](Telecel.jsx#L52-L72), [AT.jsx](AT.jsx#L67-L87)

**Problem:**
```javascript
// User balance check (client-side only, can be stale)
const userBalance = Number(user?.balance ?? user?.wallet ?? 0)
const displayPrice = Number(b.price) || 0

if (user && userBalance < displayPrice) {
  // ✅ Requires Paystack verification
  const { initPaystack } = await import('./utils/paystack')
  await initPaystack(initPayload)
  return
}

// ❌ If balance is sufficient, proceeds WITHOUT ANY payment verification
const payload = {
  phoneNumber: phone,
  network: mapNetwork(b.network),
  capacity: capacity,
  // NO payment reference, NO Paystack verification!
  gateway: 'wallet'
}

axios.post(purchaseUrl, payload, { headers })
```

**Why it's a problem:**
- When `userBalance >= displayPrice`, the code assumes payment is verified
- Sends purchase directly to [purchase-proxy.js](netlify/functions/purchase-proxy.js) WITHOUT a `paystackRef`
- In `purchase-proxy.js`, the Paystack verification block only runs IF `paystackRef` is provided (line 228)
- Without it, the function skips ALL payment validation and forwards directly to HubNet

**Impact:**
- ✗ No proof of payment
- ✗ No Paystack verification
- ✗ No transaction audit trail
- ✗ Orders can be placed with zero monetary exchange
- ✗ Revenue leak

---

### 🔴 **ROOT CAUSE 2: Race Condition - Concurrent Balance Spending**

**Location:** [MTN.jsx](MTN.jsx#L65), [MTN.jsx](MTN.jsx#L160-L180)

**Problem:**
```javascript
// TIME T1: Balance check in client (stale data possible)
const userBalance = Number(user?.balance ?? user?.wallet ?? 0)
if (userBalance >= displayPrice) {
  // Proceeds to purchase
}

// TIME T2: Purchase API call
axios.post(purchaseUrl, payload, { headers })
  .then(async (res) => {
    // TIME T3: Only AFTER API succeeds, deduct balance
    await runTransaction(db, async (tx) => {
      const current = Number(snap.data().balance ?? 0)
      if (current < displayPrice) throw new Error('Insufficient balance')
      tx.update(userDocRef, { balance: current - displayPrice })
    })
  })
```

**Race Scenario:**
1. User has GHS 10 balance
2. User clicks "Place Order" for GHS 10 bundle (T1: Balance check passes ✓)
3. Before balance deduction, user clicks another bundle (same time)
4. Second request also sees GHS 10 balance (T1: Check passes ✓)
5. First order placed at HubNet (T2)
6. Second order placed at HubNet (T2)
7. Both orders confirmed by HubNet
8. First order tries to deduct GHS 10 (T3: Transaction succeeds ✓)
9. Second order tries to deduct GHS 10 (T3: Transaction fails ✗ - but order already placed!)

**Impact:**
- ✗ User's wallet balance goes negative or stale
- ✗ Multiple bundles sent for one payment
- ✗ Balance inconsistency

---

### 🔴 **ROOT CAUSE 3: Insufficient Authentication for Wallet Purchases**

**Location:** [purchase-proxy.js](netlify/functions/purchase-proxy.js#L140-L310)

**Problem:**
```javascript
// In purchase-proxy.js - if NO paystackRef provided:
if (paystackRef) {
  // ✓ Verify Paystack transaction (server-side auth required)
} else {
  // ❌ No authentication check!
  // ❌ No userId validation!
  // ❌ Anyone can call this endpoint
  const resp = await axios.post(purchaseUrl, hubnetPayload, { headers, timeout: 15000 })
}
```

**Why it's a problem:**
- `purchase-proxy` receives requests from the client
- When using wallet ("gateway: 'wallet'"), there's NO server-side verification that:
  - The request is from an authenticated user
  - The user ID in the request matches the authenticated user
  - The balance deduction was actually processed
- Compared to Paystack flow where Paystack API verifies everything server-side

**Attack Scenario:**
```bash
# Attacker can call this directly from browser console or curl:
curl -X POST https://puls.app/.netlify/functions/purchase-proxy \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"0501234567", "network":"mtn", "capacity":"500", "userId":"ANY_USER_ID"}'
# ✗ Order placed without payment!
```

**Impact:**
- ✗ No user authentication
- ✗ Unauthorized orders possible
- ✗ Users could order for others' numbers without paying

---

### 🔴 **ROOT CAUSE 4: Async Balance Deduction After Success Confirmation**

**Location:** [MTN.jsx](MTN.jsx#L125-L180)

**Problem:**
```javascript
axios.post(purchaseUrl, payload, { headers })
  .then(async (res) => {
    console.log('Purchase response:', res.data);
    const success = resp?.status === 'success'
    
    if (success) {
      // ✗ Success modal shown IMMEDIATELY
      setSuccessModalOpen(true)
      setPlacing(false)
      
      try {
        // ✗ Balance deduction happens in background
        // If this fails, user already sees success message
        await runTransaction(db, async (tx) => {
          // ...deduct balance...
        })
      } catch (err) {
        // ✗ Error silently logged, user doesn't know deduction failed
        console.error('Failed saving purchase or updating balance in Firestore', err)
      }
    }
  })
```

**Scenario:**
1. Purchase API returns 200 ✓
2. Success modal shown to user
3. User thinks order is paid and complete
4. Balance deduction transaction fails (Firestore error, network issue, etc.)
5. Order was placed but balance was NOT deducted
6. User's balance appears unchanged despite order going through

**Impact:**
- ✗ False success confirmations
- ✗ Balance and order records out of sync
- ✗ User confusion: "Why wasn't my balance deducted?"

---

### 🔴 **ROOT CAUSE 5: Stale Client-Side Balance Data**

**Location:** [MTN.jsx](MTN.jsx#L65), [AuthContext.jsx](src/context/AuthContext.jsx#L19-L27)

**Problem:**
```javascript
// AuthContext subscribes to user doc, but with latency
useEffect(() => {
  unsubDoc = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
    setUser({ ...userDoc })
    // ✗ Latency: 50-500ms before component updates
  })
}, [])

// Component uses stale balance
const userBalance = Number(user?.balance ?? user?.wallet ?? 0)
```

**Timing Issue:**
- Firestore balance updates have network latency
- Balance shown in UI may be 100-500ms behind server
- If user quickly places orders, they see old balance
- Multiple orders can be placed while balance updates travel over network

**Impact:**
- ✗ Client-side balance checks unreliable
- ✗ False impression of available funds
- ✗ Race conditions become more likely

---

## EVIDENCE

### Code Flow Showing Bypass
```
MTN.jsx handleBuy()
  ├─ Check: userBalance >= displayPrice? (CLIENT SIDE, STALE)
  ├─ YES → Skip Paystack entirely ❌
  ├─ axios.post(purchaseUrl, payload) with gateway='wallet'
  │
  └─ purchase-proxy.js
      ├─ Check: paystackRef provided?
      ├─ NO → Skip verification ❌
      ├─ NO userId validation ❌
      ├─ NO auth required ❌
      └─ Forward to HubNet → ORDER PLACED ✓ (WITHOUT VERIFICATION)
```

### Comparison: Paystack Flow vs Wallet Flow

| Step | Paystack Flow | Wallet Flow |
|------|---------------|------------|
| User balance check | Client-side | Client-side (stale) |
| Payment verification | ✓ Paystack API (server) | ✗ None |
| Authentication | ✓ Paystack transaction ID | ✗ None |
| Authorization | ✓ Verified amount | ✗ Trust balance data |
| Audit trail | ✓ Paystack reference | ✗ None |
| User validation | ✓ Email matched | ✗ None |
| Vulnerability | Low | CRITICAL |

---

## CASCADING FAILURES

1. **Scenario: User A has GHS 5 balance**
   - Tries to buy GHS 8 bundle
   - Client check: GHS 5 < GHS 8 → Redirect to Paystack ✓
   
2. **But if race condition + stale data:**
   - User A balance updated to GHS 12 in DB
   - But client still shows GHS 5
   - User still redirected to Paystack (false positive)
   - OR payment processed unnecessarily

3. **Conversely - User B has GHS 8 balance**
   - Tries to buy GHS 8 bundle
   - Client check: GHS 8 >= GHS 8 ✓ (but this was GHS 5, now GHS 3 after other purchases)
   - Purchase sent directly (no Paystack)
   - purchase-proxy forwards to HubNet
   - Order placed ✓ WITHOUT verification
   - Balance deduction fails due to insufficient funds in DB
   - User sees success but balance not updated

---

## IMMEDIATE FIXES NEEDED

### **Priority 1: CRITICAL (Do First)**
1. **Add server-side balance verification in purchase-proxy**
   - Require `Authorization` header with Firebase ID token
   - Verify user ID matches authenticated user
   - Query Firestore for current balance server-side
   - Validate balance BEFORE forwarding to HubNet

2. **Require Paystack verification for ALL purchases**
   - Even wallet purchases must go through Paystack with minimum transaction
   - OR create internal payment verification system
   - DO NOT allow purchases without payment proof

3. **Lock user balance during purchase**
   - Deduct balance IMMEDIATELY after API success
   - Use Firestore transaction with pre-authorization
   - NOT in background/async

### **Priority 2: HIGH**
4. **Add transaction logging**
   - Log every balance deduction attempt
   - Log every purchase with payment reference
   - Create audit trail

5. **Validate request origin**
   - Check Firebase auth token in purchase-proxy headers
   - Verify userId matches Auth user
   - Block anonymous requests

6. **Add concurrent request detection**
   - Implement request deduplication
   - Use idempotency keys for wallet purchases too
   - Prevent double-spending

---

## RECOMMENDED SOLUTION ARCHITECTURE

```
Client (MTN.jsx/Telecel.jsx/AT.jsx)
  ├─ Bundle Selected
  └─ "Place Order" clicked
      └─ axios.post('/purchase', {phoneNumber, network, capacity, ...})
          └─ Backend receives request
              ├─ Verify Firebase ID token ✓
              ├─ Query Firestore balance server-side ✓
              ├─ Check: balance >= price?
              │   ├─ NO → Send Paystack init payload ✓
              │   └─ YES → Create internal purchase voucher ✓
              ├─ Atomically deduct balance (transaction) ✓
              ├─ Forward to HubNet with payment proof ✓
              └─ Return order reference
```

---

## TESTING RECOMMENDATIONS

1. **Test concurrent orders** with insufficient balance
2. **Test rapid clicks** on place order button
3. **Test wallet purchase bypass** by:
   - Mocking balance in client dev tools
   - Intercepting network request to add fake balance
   - Calling purchase-proxy directly from curl
4. **Test Paystack flow** still works correctly
5. **Test balance consistency** in Firestore vs client

---

## FILES AFFECTED
- [MTN.jsx](MTN.jsx)
- [Telecel.jsx](Telecel.jsx)
- [AT.jsx](AT.jsx)
- [purchase-proxy.js](netlify/functions/purchase-proxy.js)
- [PaystackCallback.jsx](src/PaystackCallback.jsx)
- [AuthContext.jsx](src/context/AuthContext.jsx)

---

## SEVERITY
**CRITICAL** - Revenue Loss + Fraud Vector
- Orders placed without payment
- Wallet balance unreliable
- Bypass of all payment verification
