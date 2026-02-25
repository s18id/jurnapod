# Manual Testing Guide - Invoice Payment Default

## Setup

**Dev Environment Running:**
- ✅ API Server: http://localhost:3001/api
- ✅ Backoffice: http://localhost:5173
- ✅ Database: MySQL (db3307)

**Test Credentials:**
- Company Code: `JP`
- Email: `ahmad@signal18.id`
- Password: `ChangeMe123!`

---

## Test Suite

### Test 1: Login and Navigate to Settings

**Steps:**
1. Open browser: http://localhost:5173
2. Login with credentials above
3. Navigate to: Settings → Account Mapping Settings (or Payment Methods)

**Expected:**
- ✅ Login successful
- ✅ Can see Payment Methods section
- ✅ Table shows: Method Code | Label | Account | **Invoice Default** (new column)

**Screenshot Locations:**
- Settings page with new "Invoice Default" column

---

### Test 2: Configure Invoice Default (First Time)

**Steps:**
1. In Payment Methods section, find CASH method
2. Check the "Invoice Default" checkbox for CASH
3. Click "Save Payment Mappings"
4. Wait for success message
5. Reload page

**Expected:**
- ✅ Checkbox can be clicked
- ✅ Save button works
- ✅ Success message appears
- ✅ After reload, CASH still shows checked

**Current State:**
- CASH is already set as default (from previous test)
- You should see it checked ✓

---

### Test 3: Try to Set Multiple Defaults (Should Fail)

**Steps:**
1. CASH already has "Invoice Default" checked
2. Try to check "Invoice Default" for QRIS (if it exists)
3. Click "Save Payment Mappings"

**Expected:**
- ✅ Save button executes
- ❌ Error message appears: "Only one payment method can be set as invoice default"
- ✅ No changes saved
- ✅ CASH remains the only default

**This tests validation works correctly**

---

### Test 4: Change Default from One Method to Another

**Steps:**
1. Uncheck "Invoice Default" for CASH
2. Check "Invoice Default" for QRIS (or another method)
3. Click "Save Payment Mappings"
4. Wait for success
5. Reload page

**Expected:**
- ✅ Can uncheck CASH
- ✅ Can check QRIS
- ✅ Save successful
- ✅ After reload, only QRIS is checked

**Note:** You may need to add QRIS payment method first if it doesn't exist:
- Enter "QRIS" in Method Code field
- Enter "QRIS Payment" in Label field
- Click "Add Method"
- Select a payable account
- Then set as default

---

### Test 5: Sales Payment - Auto-Selection Works

**Steps:**
1. Navigate to: Sales → Payments
2. Look at "Create Payment" form
3. Check the "Account" dropdown

**Expected:**
- ✅ Account dropdown is **already filled** with the default payment method
- ✅ Shows the account that was marked as invoice default
- ✅ If CASH is default and points to account "1101-Cash", dropdown shows "1101-Cash"

**This is the main feature - auto-selection!**

---

### Test 6: Sales Payment - Manual Override

**Steps:**
1. In Sales → Payments "Create Payment" form
2. Account is already filled with default
3. Click the Account dropdown
4. Select a different account manually
5. Fill in other fields (Payment No, Invoice ID, Amount)
6. Click "Create payment"

**Expected:**
- ✅ Can change to different account
- ✅ Selected account overrides the default
- ✅ Payment created successfully with manually selected account

**This tests users can override default when needed**

---

### Test 7: Warning When No Default Configured

**Steps:**
1. Go back to Settings → Payment Methods
2. Uncheck all "Invoice Default" checkboxes
3. Click "Save Payment Mappings"
4. Navigate to Sales → Payments

**Expected:**
- ✅ Yellow/orange warning banner appears
- ✅ Message: "ℹ️ No invoice default payment method configured. Please set a default in Settings → Payment Methods."
- ✅ Account dropdown is empty (shows "-- Select Account --")

**This tests the helpful warning system**

---

### Test 8: Outlet Switching

**Steps:**
1. Configure invoice default for Outlet 1
2. Switch to Outlet 2 (if you have multiple outlets)
3. Check if Outlet 2 has different or no default
4. Configure different default for Outlet 2

**Expected:**
- ✅ Each outlet can have independent defaults
- ✅ Switching outlets shows correct default for that outlet
- ✅ Changes to one outlet don't affect other outlets

**This tests multi-outlet support**

---

### Test 9: Delete Default Payment Method

**Steps:**
1. Set CASH as invoice default
2. Go to payment methods
3. Remove CASH method entirely (if possible)
4. Go to Sales → Payments

**Expected:**
- ✅ Warning appears (no default configured)
- ✅ System doesn't crash
- ✅ User is prompted to configure new default

**This tests graceful handling of deleted defaults**

---

### Test 10: Browser Compatibility

**Repeat Tests 2, 5, 6 on different browsers:**
- [ ] Chrome/Chromium
- [ ] Firefox
- [ ] Safari (if on Mac)
- [ ] Edge

**Expected:**
- ✅ Checkbox works on all browsers
- ✅ Auto-selection works on all browsers
- ✅ UI looks correct on all browsers

---

### Test 11: Mobile/Responsive

**Steps:**
1. Open browser DevTools (F12)
2. Toggle device toolbar (mobile view)
3. Test on different screen sizes:
   - Mobile (375px)
   - Tablet (768px)
   - Desktop (1920px)

**Expected:**
- ✅ Payment Methods table is scrollable on mobile
- ✅ Checkboxes are clickable on touch devices
- ✅ Forms remain usable on small screens

---

## Quick Test Checklist

Use this for rapid testing:

- [ ] Login works
- [ ] Settings page loads
- [ ] "Invoice Default" column visible
- [ ] Can check one default
- [ ] Cannot check multiple defaults (error shown)
- [ ] Sales Payments auto-fills account
- [ ] Can manually override default
- [ ] Warning shows when no default
- [ ] Outlet switching works
- [ ] Browser compatibility OK

---

## Known Issues to Watch For

1. **Checkbox Toggle Race Condition**
   - If clicking too fast, state might not update
   - Solution: Debounce or disable during save

2. **Stale Data After Save**
   - Cache might show old default
   - Solution: Ensure refetch after save

3. **Empty Account Dropdown**
   - If no payable accounts exist
   - Should show message, not crash

4. **Multiple Outlets Confusion**
   - Users might think default is global
   - Ensure UI clearly shows "per outlet"

---

## Performance Testing

Optional but recommended:

1. **Load Time**
   - Settings page should load in < 1 second
   - Payment methods API < 200ms

2. **Save Time**
   - Saving payment mappings < 500ms
   - No UI freezing during save

3. **Large Dataset**
   - Test with 50+ payment methods
   - Table should still be usable

---

## Reporting Issues

If you find bugs, note:
1. **What you did** (exact steps)
2. **What happened** (actual result)
3. **What you expected** (expected result)
4. **Screenshot** (if UI issue)
5. **Browser console errors** (F12 → Console)
6. **Network errors** (F12 → Network)

---

## Success Criteria

All tests pass ✅ and:
- Feature is intuitive to use
- No console errors
- Performance is acceptable
- UI looks professional
- Error messages are helpful
- Works on all browsers

---

## After Testing

Once all tests pass:
- [ ] Document any bugs found
- [ ] Fix critical issues
- [ ] Update this guide with findings
- [ ] Mark feature as "Ready for Production"

---

## Quick Start Command

```bash
# Open backoffice in browser
xdg-open http://localhost:5173

# Or on Mac:
open http://localhost:5173

# Monitor API logs in terminal:
tail -f apps/api/logs/app.log
```

Start with **Test 1** and work through sequentially. Good luck! 🚀
