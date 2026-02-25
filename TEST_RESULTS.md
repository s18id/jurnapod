# Manual Testing Results - Invoice Payment Default

**Date:** 2026-02-26
**Tester:** Ahmad
**Environment:** Dev (localhost)

---

## Quick Test Results

### ✅ Test 1: Settings Page - New Column Visible
- [ ] PASS
- [ ] FAIL
- [ ] NOT TESTED

**Notes:**
```
- Navigate to: Settings → Account Mapping Settings
- Scroll to: POS Payment Methods section
- Expected: See "Invoice Default" column (4th column)
- Actual: 


```

---

### ✅ Test 2: CASH Already Set as Default
- [ ] PASS
- [ ] FAIL
- [ ] NOT TESTED

**Notes:**
```
- Expected: CASH row has Invoice Default checkbox CHECKED ✓
- Actual:


```

---

### ✅ Test 3: Change Default to Another Method
- [ ] PASS
- [ ] FAIL
- [ ] NOT TESTED

**Steps:**
1. Uncheck CASH
2. Add QRIS method (if not exists): Code=QRIS, Label=QRIS, Account=any payable
3. Check QRIS as Invoice Default
4. Click "Save Payment Mappings"
5. Reload page

**Notes:**
```
- Expected: Save successful, only QRIS checked after reload
- Actual:


```

---

### ✅ Test 4: Try Multiple Defaults (Should Fail)
- [ ] PASS
- [ ] FAIL
- [ ] NOT TESTED

**Steps:**
1. Check CASH as Invoice Default
2. Check QRIS as Invoice Default (both checked)
3. Click "Save Payment Mappings"

**Notes:**
```
- Expected: Error message "Only one payment method can be set as invoice default"
- Actual:


```

---

### ✅ Test 5: Sales Payments Auto-Selection
- [ ] PASS
- [ ] FAIL
- [ ] NOT TESTED

**Steps:**
1. Ensure CASH is set as invoice default
2. Navigate to: Sales → Payments
3. Look at "Account" dropdown in Create Payment form

**Notes:**
```
- Expected: Account dropdown pre-filled with CASH account (e.g., "1101-Cash")
- Actual:


```

---

### ✅ Test 6: Manual Override Works
- [ ] PASS
- [ ] FAIL
- [ ] NOT TESTED

**Steps:**
1. In Sales → Payments form
2. Change Account dropdown to different account
3. Fill form and create payment

**Notes:**
```
- Expected: Can select different account, payment created successfully
- Actual:


```

---

### ✅ Test 7: Warning When No Default
- [ ] PASS
- [ ] FAIL
- [ ] NOT TESTED

**Steps:**
1. Go to Settings → Payment Methods
2. Uncheck all Invoice Default checkboxes
3. Save
4. Go to Sales → Payments

**Notes:**
```
- Expected: Yellow warning banner with message about no default configured
- Actual:


```

---

## Browser Console Errors

**Check F12 → Console for errors:**
```
(Paste any errors here)


```

---

## Network Errors

**Check F12 → Network for failed requests:**
```
(Note any failed API calls)


```

---

## UI/UX Issues

**Visual problems, alignment, spacing, etc:**
```
(Describe any UI issues)


```

---

## Performance

**Loading times:**
- Settings page load: _____ seconds
- Save payment mappings: _____ seconds  
- Sales Payments page load: _____ seconds

---

## Overall Assessment

- [ ] ✅ All core features working
- [ ] ⚠️ Minor issues found (document above)
- [ ] ❌ Critical issues found (document above)
- [ ] 🚫 Cannot test (blocked by _______)

---

## Critical Issues (if any)

**Issue #1:**
```
Description:

Steps to reproduce:

Expected:

Actual:

Priority: HIGH / MEDIUM / LOW
```

---

## Next Steps

- [ ] All tests pass → Ready for code review
- [ ] Minor fixes needed → Document issues and fix
- [ ] Major issues → Need redesign/refactor
- [ ] Need more testing on different browsers

---

## Sign-off

**Tested by:** _________________
**Date:** _________________
**Status:** PASS / FAIL / NEEDS WORK
