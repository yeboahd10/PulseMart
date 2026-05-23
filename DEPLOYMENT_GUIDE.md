# Quick Reference: Deployment & Testing

## Deployment Checklist

### Prerequisites
- [ ] Ensure Firebase Admin SDK credentials are set up in Netlify
- [ ] Check Netlify environment variables:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_DB_URL`  
  - `PAYSTACK_SECRET_KEY` (secret key, not public)
  - `HUBNET_API_KEY`

### Step 1: Deploy Backend
```bash
# Deploy netlify/functions/purchase-proxy.js
netlify deploy
```

### Step 2: Monitor for 1 hour
- Check Netlify function logs
- Verify no new errors
- Test wallet purchase with sufficient balance

### Step 3: Deploy Client
```bash
# Deploy src/MTN.jsx, src/Telecel.jsx, src/AT.jsx, src/PaystackCallback.jsx
npm run build
netlify deploy
```

### Step 4: Verify in Production
- [ ] Test wallet purchase (sufficient balance)
- [ ] Test Paystack purchase (insufficient balance)
- [ ] Check balance_transactions collection has entries
- [ ] Verify no errors in Netlify logs

---

## Manual Testing

### Test 1: Wallet Purchase (Sufficient Balance)
```
1. Log in
2. Go to MTN/Telecel/AT page
3. Ensure wallet balance > bundle price
4. Select bundle, enter phone number
5. Click "Place Order"
6. Expected: Success modal shows, order appears in Dashboard
7. Verify: balance_transactions collection has deduction entry
```

### Test 2: Paystack Purchase (Insufficient Balance)
```
1. Log in
2. Go to MTN page
3. Set wallet balance to 0 (in Dashboard)
4. Select GHS 10 bundle
5. Enter phone number
6. Click "Place Order"
7. Expected: Redirected to Paystack payment page
8. Complete payment with test card: 4111111111111111
9. Expected: Redirected to callback, credited balance
10. Verify: balance_transactions has credit entry with original amount
```

### Test 3: Concurrent Orders (Race Condition)
```
1. Log in with balance GHS 20
2. Open browser developer console
3. Paste this code:
   const makeOrder = () => {
     const payload = {
       phoneNumber: '0501234567',
       network: 'mtn',
       capacity: '500',
       userId: 'YOUR_USER_ID',
       displayPrice: 5,
       gateway: 'wallet'
     }
     const token = await getAuth().currentUser.getIdToken()
     fetch('/.netlify/functions/purchase-proxy', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
       body: JSON.stringify(payload)
     })
   }
   // Make 3 requests simultaneously
   Promise.all([makeOrder(), makeOrder(), makeOrder()])
4. Expected: First succeeds (200), others return 409 Conflict
5. Verify: Balance deducted only once
6. Check purchase_log: should show duplicates detected
```

### Test 4: Missing Auth Header
```
1. From Terminal or Postman:
curl -X POST https://puls.app/.netlify/functions/purchase-proxy \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"0501234567","network":"mtn","capacity":"500"}'
2. Expected: 401 Unauthorized response
3. Message: "Missing or invalid Authorization header"
```

### Test 5: User ID Mismatch
```
1. Log in as User A (get token)
2. Send request with:
   - Authorization: Bearer <User A Token>
   - userId: "different_user_id"
3. Expected: 403 Forbidden
4. Message: "User ID mismatch"
```

### Test 6: Insufficient Balance
```
1. Log in with balance GHS 2
2. Send purchase request for GHS 10 bundle
3. Get auth token from User A
4. Expected: 400 Bad Request
5. Response contains: {
     "message": "Insufficient balance",
     "balance": 2,
     "required": 10,
     "shortfall": 8
   }
```

---

## Firestore Collections to Monitor

### balance_transactions
```javascript
// Check: Navigate to Firestore > balance_transactions
// Each purchase/credit should have an entry like:
{
  userId: "abc123xyz",
  type: "deduction",
  amount: 5.00,
  newBalance: 15.00,
  purchaseRef: "HBxxxxxxxxx",
  timestamp: Timestamp(...)
}
```

### purchase_log
```javascript
// Check: Navigate to Firestore > purchase_log
// Should see entries like:
{
  userId: "abc123xyz",
  phoneNumber: "0501234567",
  network: "mtn",
  capacity: "500",
  gateway: "wallet",
  displayPrice: 5.00,
  status: "success",
  orderReference: "HBxxxxxxxxx",
  newBalance: 15.00,
  balanceDeducted: true,
  timestamp: Timestamp(...)
}
```

---

## Common Issues & Fixes

### Issue: "Token verification failed"
**Cause:** Invalid Firebase ID token or expired
**Fix:** 
- Clear browser local storage
- Log out and log in again
- Check Firebase credentials in Netlify config

### Issue: "Insufficient balance" error on wallet purchases
**Expected:** This is correct behavior if user balance < price
**Fix:** Top up wallet via Dashboard first

### Issue: "Duplicate purchase attempt detected"
**Cause:** User clicked button twice within 30 seconds
**Expected:** This is correct behavior for security
**Fix:** Wait 30 seconds and try again

### Issue: Balance deduction fails but order placed
**Critical:** Requires manual audit
**Fix:**
- Check `purchase_log` collection for failed entries
- Manually credit user balance
- Contact support to investigate

### Issue: Orders not appearing in Dashboard
**Check:**
- Order saved to `purchases` collection?
- User ID matches in `purchases` doc?
- Balance transaction logged?
- Check browser console for errors

---

## Rollback Plan

If critical issues found:

### Rollback Backend (5 min downtime)
```bash
# Revert purchase-proxy.js to previous version
git revert <commit>
netlify deploy
```

### Rollback Client (2 min downtime)
```bash
# Revert MTN/Telecel/AT files
git revert <commit>
npm run build
netlify deploy
```

**Note:** After rollback, old code doesn't require auth header, so it continues working normally (less secure but functional).

---

## Success Metrics

After deployment, verify:

- [ ] **Zero authentication errors** in wallet purchases
- [ ] **100% of wallet purchases** have `balance_transactions` entries
- [ ] **Zero duplicate orders** within 30-second window
- [ ] **Balance always correct** after purchase (no negative balances)
- [ ] **All Paystack purchases** still work as before
- [ ] **Dashboard orders** show correct details
- [ ] **No increase in error rate** in Netlify functions
- [ ] **All audit trails** populated correctly

---

## Support Contacts

- Netlify Issues: Check deployment logs in Netlify dashboard
- Firebase Issues: Check Firebase Console > Firestore
- Paystack Issues: Check Paystack Dashboard for transaction status
- HubNet Issues: Check HubNet delivery tracker

---

