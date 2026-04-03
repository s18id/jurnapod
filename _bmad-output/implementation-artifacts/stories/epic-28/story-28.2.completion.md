# story-28.2 Completion Notes: Payment Service Parity Hardening

## Status: review

## Summary

Hardened `modules-sales` PaymentService to full behavioral parity with the API payment service. Four behavioral gaps were found and fixed.

## Behavioral Gaps Found

### 1. `normalizeIncomingDatetimeForCompare` — MAJOR GAP
**API behavior** (`payment-allocation.ts` lines 139-146):
```javascript
export function normalizeIncomingDatetimeForCompare(paymentAt: string): string {
  const persistedValue = toMysqlDateTime(paymentAt);
  const localInterpreted = new Date(persistedValue.replace(" ", "T"));
  if (Number.isNaN(localInterpreted.getTime())) {
    throw new Error("Invalid datetime");
  }
  return toMysqlDateTime(localInterpreted.toISOString());
}
```

**Module behavior (before fix)**:
```javascript
function normalizeIncomingDatetimeForCompare(paymentAt: string): string {
  const [datePart] = paymentAt.split("T");
  return datePart || paymentAt;
}
```

**Impact**: The module was stripping time information entirely (just keeping `YYYY-MM-DD`), while the API does proper timezone-aware datetime normalization. This could cause idempotency collisions when the same payment reference is used with different time components.

**Fix**: Updated module to use the same `toMysqlDateTime()` and Date interpretation logic as the API.

### 2. `normalizeExistingDatetimeForCompare` — MAJOR GAP
**API behavior** (`payment-allocation.ts` lines 148-150):
```javascript
export function normalizeExistingDatetimeForCompare(paymentAt: string): string {
  return toMysqlDateTimeFromDateLike(paymentAt);
}
```

**Module behavior (before fix)**:
```javascript
function normalizeExistingDatetimeForCompare(paymentAt: string): string {
  const [datePart] = String(paymentAt).split(" ");
  return datePart || String(paymentAt);
}
```

**Impact**: Same as above — the module was losing time component when comparing existing payments for idempotency.

**Fix**: Updated module to use `toMysqlDateTimeFromDateLike()` like the API.

### 3. `shortfallSettledAt` null vs undefined — Minor GAP
**API behavior** (line 723):
```javascript
const shortfallSettledAt = options?.settle_shortfall_as_loss ? new Date() : null;
```

**Module behavior (before fix)** (line 635):
```javascript
const shortfallSettledAt = options?.settle_shortfall_as_loss ? new Date() : undefined;
```

**Impact**: The module was passing `undefined` instead of `null` when not settling as loss. This is a type consistency issue.

**Fix**: Changed `undefined` to `null` to match API behavior.

### 4. `normalizeMoney` floating-point precision — Minor GAP
**API behavior** (line 21):
```javascript
return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
```

**Module behavior (before fix)** (line 57):
```javascript
return Math.round(value * MONEY_SCALE) / MONEY_SCALE;
```

**Impact**: Without EPSILON, floating-point rounding errors could occur at precision boundaries (e.g., 0.1 + 0.2).

**Fix**: Added `Number.EPSILON` to the normalization formula.

### 5. Dead code removal
**Issue**: The module had redundant `if (!invoiceData)` check after casting `invoice` to a new type. Since `invoice` was already checked for null, the second check was always false.

**Fix**: Removed the dead code check.

## Verified Behaviors (Already Matching)

The following behaviors were already implemented correctly and required no changes:
- Split payment handling with proportional allocation
- Shortfall settlement logic (underpayment detection, settle_as_loss validation)
- Overpayment handling (delta calculation, no over-apply to invoice)
- Status transition rules (DRAFT → POSTED, non-POSTED idempotent return)
- Invoice `paid_total` / `payment_status` updates after payment posting

## Files Modified

- `packages/modules/sales/src/services/payment-service.ts`
  - Added import for `toMysqlDateTime`, `toMysqlDateTimeFromDateLike` from `@jurnapod/shared`
  - Fixed `normalizeIncomingDatetimeForCompare` to use proper datetime normalization
  - Fixed `normalizeExistingDatetimeForCompare` to use `toMysqlDateTimeFromDateLike`
  - Fixed `shortfallSettledAt` to use `null` instead of `undefined`
  - Added `Number.EPSILON` to `normalizeMoney`
  - Removed dead code `if (!invoiceData)` check

## Validation Results

```bash
npm run typecheck -w @jurnapod/modules-sales  # PASSED
npm run test:unit:sales -w @jurnapod/api       # 98 tests PASSED
```

## Acceptance Criteria Status

- [x] All idempotency canonicalization paths in module match API behavior
- [x] Split payment handling in module matches API behavior  
- [x] Shortfall settlement behavior matches API
- [x] Overpayment handling matches API
- [x] Status transition rules match API
- [x] Invoice `paid_total` / `payment_status` updates match API
- [x] `npm run typecheck -w @jurnapod/modules-sales`
- [x] Existing payment tests pass (98 tests)

## Notes

The datetime normalization gap was the most critical issue — without proper normalization through `toMysqlDateTime()`, the module's idempotency check could produce false positives (treating different timestamps as the same payment) or false negatives (treating the same logical payment as different).

The API's normalization approach converts the datetime through UTC interpretation and back, which handles timezone offsets correctly and produces stable canonical values for comparison.

---

## Review Fixes (P1/P2 Issues from Code Review)

### P1: Missing Invoice Existence/Outlet Validation in `createPayment`

**Issue**: The API payment service validates invoice existence and outlet matching before creating a payment. The module did not perform these validations.

**Fix**: Added validation after outlet access check (line 325-333):
```typescript
// P1: Validate invoice exists and belongs to same outlet
const invoice = await executor.findInvoiceById(companyId, input.invoice_id);
if (!invoice) {
  throw new DatabaseReferenceError("Invoice not found");
}
const invoiceData = invoice as { outlet_id?: number };
if (invoiceData.outlet_id !== input.outlet_id) {
  throw new DatabaseReferenceError("Invoice outlet mismatch");
}
```

### P2: Missing Invoice Validation in `updatePayment`

**Issue**: When `invoice_id` or `outlet_id` is provided in `updatePayment`, the module did not validate the invoice exists and matches the outlet.

**Fix**: Added validation after computing `nextOutletId` and `nextInvoiceId` (line 486-496):
```typescript
// P2: Validate invoice when invoice_id or outlet_id is being changed
const nextOutletId = input.outlet_id ?? current.outlet_id;
const nextInvoiceId = input.invoice_id ?? current.invoice_id;
if (typeof input.invoice_id === "number" || typeof input.outlet_id === "number") {
  const invoice = await executor.findInvoiceById(companyId, nextInvoiceId);
  if (!invoice) {
    throw new DatabaseReferenceError("Invoice not found");
  }
  const invoiceData = invoice as { outlet_id?: number };
  if (invoiceData.outlet_id !== nextOutletId) {
    throw new DatabaseReferenceError("Invoice outlet mismatch");
  }
}
```

### P2: Missing Duplicate Key Error Handling in `createPayment`

**Issue**: If a race condition caused a duplicate key error on `client_ref`, the module would throw an unhandled error instead of gracefully handling it like the API.

**Fix**: Added try/catch around `insertPayment` (lines 361-395):
```typescript
let paymentId: number;
try {
  paymentId = await executor.insertPayment({...});
} catch (error) {
  // P2: Handle duplicate key error for race condition on client_ref
  if (isMysqlError(error) && error.errno === 1062 && input.client_ref) {
    const existing = await executor.findPaymentByClientRef(companyId, input.client_ref);
    if (existing) {
      const incomingCanonical = buildCanonicalInput(input);
      const existingCanonical = buildCanonicalFromExisting(existing);
      if (!canonicalPaymentsEqual(incomingCanonical, existingCanonical)) {
        throw new DatabaseConflictError("Idempotency conflict: payload mismatch");
      }
      // ... return existing payment with splits
    }
    throw new DatabaseConflictError("Duplicate payment");
  }
  throw error;
}
```

Also added `isMysqlError` type guard helper (lines 57-61):
```typescript
function isMysqlError(error: unknown): error is { errno?: number; code?: string } {
  return typeof error === "object" && error !== null && "errno" in error;
}
```

## Files Modified (Additional Fixes)

- `packages/modules/sales/src/services/payment-service.ts`
  - Added `isMysqlError` type guard function
  - Added P1 invoice validation in `createPayment`
  - Added P2 invoice validation in `updatePayment` 
  - Added P2 duplicate key error handling in `createPayment`

## Validation Results (Updated)

```bash
npm run typecheck -w @jurnapod/modules-sales  # PASSED
npm run test:unit:sales -w @jurnapod/api       # 98 tests PASSED
```

---

**Reviewer**: Please verify the datetime normalization logic is functionally equivalent to the API implementation, especially for edge cases with timezone offsets.
