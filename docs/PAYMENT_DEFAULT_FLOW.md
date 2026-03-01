<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Invoice Payment Default - User Flow

## Feature Overview
Auto-select the default payment account when creating invoice payments in the backoffice.

---

## Flow Diagrams

### 1. Admin Configures Default (Settings)

```
┌─────────────────────────────────────────────────────┐
│  Settings → Payment Methods                          │
│                                                      │
│  Outlet: Main Branch                [Reload ↻]      │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │ Method    Label   Account          Invoice    │ │
│  │ Code                               Default    │ │
│  ├────────────────────────────────────────────────┤ │
│  │ CASH      Cash    1101-Cash        ☑         │ │  ← Admin checks this
│  │ QRIS      QRIS    1102-Bank BCA    ☐         │ │
│  │ CARD      Card    1103-Bank BRI    ☐         │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  [Save Payment Mappings]  ←── Click to save         │
└─────────────────────────────────────────────────────┘
```

**What happens:**
1. Admin checks the "Invoice Default" checkbox for CASH
2. Clicks "Save Payment Mappings"
3. API validates (only one default allowed)
4. Database updated: `is_invoice_default = 1` for CASH
5. Success message shown

---

### 2. User Creates Invoice Payment (Sales Payments)

```
┌─────────────────────────────────────────────────────┐
│  Sales → Payments                                    │
│                                                      │
│  ┌──────────────────────────────────────────────────┐
│  │ Create Payment                                   │
│  │                                                  │
│  │ Payment No:    [PAY-001          ]              │
│  │ Invoice ID:    [INV-123          ]              │
│  │ Payment Date:  [2026-02-26 10:30 ]              │
│  │ Account:       [1101-Cash        ] ← AUTO-FILLED!│
│  │ Amount:        [100000           ]              │
│  │                                                  │
│  │ [Create payment]                                │
│  └──────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────┘
```

**What happens:**
1. User opens "Create Payment" form
2. System fetches payment method mappings
3. Finds CASH has `is_invoice_default = true`
4. Auto-fills Account dropdown with "1101-Cash"
5. User fills other fields and submits
6. **Time saved:** 2-3 clicks per payment!

---

### 3. Warning When No Default Configured

```
┌─────────────────────────────────────────────────────┐
│  Sales → Payments                                    │
│                                                      │
│  ┌──────────────────────────────────────────────────┐
│  │ Create Payment                                   │
│  │                                                  │
│  │ ╔═══════════════════════════════════════════════╗│
│  │ ║ ℹ️  No invoice default payment method         ║│
│  │ ║    configured. Please set a default in        ║│
│  │ ║    Settings → Payment Methods.                ║│
│  │ ╚═══════════════════════════════════════════════╝│
│  │                                                  │
│  │ Payment No:    [PAY-001          ]              │
│  │ Invoice ID:    [INV-123          ]              │
│  │ Payment Date:  [2026-02-26 10:30 ]              │
│  │ Account:       [-- Select --     ] ← Empty      │
│  │ Amount:        [100000           ]              │
│  └──────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────┘
```

**What happens:**
1. System checks for invoice default
2. No mapping has `is_invoice_default = true`
3. Shows yellow warning banner
4. User must manually select account
5. Guides user to configure default in settings

---

## Technical Flow

### Database Query
```sql
SELECT method_code, account_id, label, is_invoice_default
FROM outlet_payment_method_mappings
WHERE company_id = 1
  AND outlet_id = 1
  AND is_invoice_default = 1
LIMIT 1;
```

### API Response
```json
{
  "ok": true,
  "outlet_id": 1,
  "mappings": [
    {
      "method_code": "CASH",
      "account_id": 160,
      "label": "Cash",
      "is_invoice_default": true  ← Flag indicates default
    }
  ]
}
```

### Frontend Logic
```typescript
// Auto-select invoice default on mount
useEffect(() => {
  if (!mappingsLoading && paymentMappings.length > 0) {
    const invoiceDefault = paymentMappings.find(
      (m) => m.is_invoice_default === true
    );
    
    if (invoiceDefault && newPayment.account_id === "") {
      setNewPayment((prev) => ({
        ...prev,
        account_id: String(invoiceDefault.account_id)
      }));
    }
  }
}, [mappingsLoading, paymentMappings]);
```

---

## Error Handling

### Multiple Defaults Prevention

```
User Action: Admin tries to check 2 invoice defaults

┌─────────────────────────────────────────────────────┐
│  Settings → Payment Methods                          │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │ Method    Account          Invoice Default    │ │
│  ├────────────────────────────────────────────────┤ │
│  │ CASH      1101-Cash        ☑                  │ │
│  │ QRIS      1102-Bank BCA    ☑                  │ │ ← Tries to check this
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  [Save Payment Mappings]  ←── Clicks save           │
│                                                      │
│  ❌ Error: Only one payment method can be set       │
│            as invoice default                        │
└─────────────────────────────────────────────────────┘

API Response:
{
  "ok": false,
  "error": {
    "code": "MULTIPLE_INVOICE_DEFAULTS",
    "message": "Only one payment method can be set as invoice default"
  }
}
```

---

## Benefits Summary

### For Admin/Accountant
- ✅ One-time setup in Settings
- ✅ Clear visual indication of default
- ✅ Can change default anytime
- ✅ Per-outlet configuration

### For Daily Users
- ✅ Faster payment entry (auto-selected account)
- ✅ Less cognitive load (don't need to remember which account)
- ✅ Fewer errors (consistent default)
- ✅ Can still override if needed

### For System
- ✅ Simple flag-based approach
- ✅ Validated at API level
- ✅ Indexed for performance
- ✅ Easy to maintain

---

## Comparison: Before vs After

### Before (Manual Selection)
```
1. Open "Create Payment" form
2. Select Invoice
3. Enter Payment No
4. Enter Date
5. Click Account dropdown         ← Extra clicks
6. Scroll to find correct account ← Cognitive load
7. Click to select                ← Extra clicks
8. Enter Amount
9. Click Submit

Total: 9+ steps with 3 extra clicks + searching
```

### After (Auto-Selection)
```
1. Open "Create Payment" form
2. Select Invoice
3. Enter Payment No
4. Enter Date
5. Account already filled! ✓      ← Saved 3 clicks
6. Enter Amount
7. Click Submit

Total: 7 steps, faster and less error-prone
```

**Time saved:** ~5-10 seconds per payment
**If processing 50 payments/day:** ~4-8 minutes saved daily

---

## Future Enhancements

Possible additions (not currently implemented):

1. **Multiple Contexts**
   - `is_invoice_default` (current) ✅
   - `is_ecommerce_default` (future)
   - `is_subscription_default` (future)

2. **User/Role Specific Defaults**
   - Different users can have different defaults
   - Role-based defaults (ACCOUNTANT vs CASHIER)

3. **Smart Defaults**
   - Most frequently used method auto-becomes default
   - AI suggests default based on usage patterns

4. **Visual Enhancements**
   - Star icon (⭐) next to default in dropdown
   - Color coding for different payment types
   - Payment method icons

---

## Conclusion

This feature provides a simple but powerful improvement to the daily workflow for creating invoice payments. By auto-selecting the most common payment account, it reduces repetitive tasks and helps users work more efficiently.
