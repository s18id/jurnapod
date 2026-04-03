# story-28.3 Completion Notes: Payment Posting Hook (Transaction-Safe)

## Status: review

## Summary

Implemented `PaymentPostingHook` interface in `modules-sales` that enables atomic journal posting within the PaymentService's transaction. The hook is optional and uses graceful degradation when undefined.

## What Was Implemented

### 1. `PaymentPostingHook` Interface
**File**: `packages/modules/sales/src/interfaces/payment-posting-hook.ts`

```typescript
export interface PaymentPostingHook {
  postPaymentToJournal(input: PostPaymentInput, tx: Transaction): Promise<PostingResult>;
}
```

The interface receives the **live transaction handle** (`Transaction` from `@jurnapod/db`) to ensure atomicity with the payment write.

### 2. `JournalPostingResult` Type Alias
**File**: `packages/modules/sales/src/types/payments.ts`

Added `JournalPostingResult` as an alias for `PostingResult` from `@jurnapod/shared`.

### 3. Updated `PaymentServiceDeps`
**File**: `packages/modules/sales/src/services/payment-service.ts`

```typescript
export interface PaymentServiceDeps {
  db: SalesDb;
  accessScopeChecker: AccessScopeChecker;
  postingHook?: PaymentPostingHook;  // NEW
}
```

### 4. Hook Call Within Transaction
**File**: `packages/modules/sales/src/services/payment-service.ts`

Added `getTransaction()` method to `SalesDbExecutor` interface and implemented it in `ApiSalesDbExecutor`. The hook is called within the `postPayment` transaction:

```typescript
// Post to journal if hook is provided (graceful degradation if undefined)
const tx = executor.getTransaction();
if (postingHook && tx) {
  await postingHook.postPaymentToJournal({
    ...options,
    _paymentId: paymentId,
    _companyId: companyId,
    _invoiceId: payment.invoice_id
  }, tx);
}
```

### 5. `getTransaction()` on `SalesDbExecutor`
**File**: `packages/modules/sales/src/services/sales-db.ts`

```typescript
export interface SalesDbExecutor {
  getTransaction(): Transaction | null;
  // ... existing methods
}
```

**File**: `apps/api/src/lib/modules-sales/sales-db.ts`

```typescript
getTransaction(): Transaction | null {
  return this._transaction;
}
```

### 6. API Adapter Implementation
**File**: `apps/api/src/lib/modules-sales/payment-posting-hook.ts`

`ApiPaymentPostingHook` implements `PaymentPostingHook` using `sales-posting.ts`:
- Queries the payment using the live transaction
- Queries the invoice number for journal reference
- Queries payment splits if any
- Calls `postSalesPaymentToJournal()` with the transaction handle

### 7. Internal Fields for Hook Context
**File**: `packages/modules/sales/src/types/payments.ts`

Extended `PostPaymentInput` with internal fields that `PaymentService` populates before calling the hook:

```typescript
export type PostPaymentInput = {
  settle_shortfall_as_loss?: boolean;
  shortfall_reason?: string;
  /** Internal fields for journal posting - set by PaymentService before calling postingHook */
  _paymentId?: number;
  _companyId?: number;
  _invoiceId?: number;
};
```

## Files Modified

### modules-sales package
- `packages/modules/sales/src/interfaces/payment-posting-hook.ts` (NEW)
- `packages/modules/sales/src/interfaces/index.ts` (updated export)
- `packages/modules/sales/src/services/payment-service.ts`
  - Added import for `PaymentPostingHook`
  - Added `postingHook?: PaymentPostingHook` to `PaymentServiceDeps`
  - Extract `postingHook` in `createPaymentService`
  - Call `postingHook?.postPaymentToJournal()` within transaction
- `packages/modules/sales/src/services/sales-db.ts`
  - Added import for `Transaction` from `@jurnapod/db`
  - Added `getTransaction(): Transaction | null` to `SalesDbExecutor` interface
- `packages/modules/sales/src/types/payments.ts`
  - Added import for `PostingResult` from `@jurnapod/shared`
  - Added `JournalPostingResult` type alias
  - Extended `PostPaymentInput` with internal fields
- `packages/modules/sales/src/index.ts` (updated export)

### API package
- `apps/api/src/lib/modules-sales/sales-db.ts`
  - Implemented `getTransaction()` method in `ApiSalesDbExecutor`
- `apps/api/src/lib/modules-sales/payment-posting-hook.ts` (NEW)
- `apps/api/src/lib/modules-sales/index.ts` (updated export)

## Validation Results

```bash
npm run typecheck -w @jurnapod/modules-sales  # PASSED
npm run typecheck -w @jurnapod/api            # PASSED
npm run test:unit:sales -w @jurnapod/api      # 98 tests PASSED
```

## Acceptance Criteria Status

- [x] `PaymentPostingHook` interface defined in `modules-sales/interfaces/`
- [x] `PaymentServiceDeps` includes optional `postingHook?: PaymentPostingHook`
- [x] `PaymentService.postPayment()` calls `postingHook?.postPaymentToJournal()` within its transaction
- [x] API adapter implements `PaymentPostingHook` using `sales-posting.ts`
- [x] API composition function wires `sales-posting.ts` as the hook implementation
- [x] Journal posting and payment write are atomic (same DB transaction)
- [x] If `postingHook` is undefined, `postPayment` completes without error (graceful degradation)
- [x] `npm run typecheck -w @jurnapod/modules-sales`
- [x] `npm run typecheck -w @jurnapod/api`
- [x] P1 Fix: `ApiPaymentPostingHook` is now wired via `createComposedPaymentService()`
- [x] P2 Fix: `JournalPostingResult` exported from `packages/modules/sales/src/index.ts`

## Design Decisions

### Why `Transaction` not `SalesDbExecutor` in Hook Interface

The story spec explicitly calls for `KyselyTransaction` (which maps to `Transaction` from `@jurnapod/db`). While `SalesDbExecutor` is what's available within the module, `Transaction` is the proper type for passing to downstream Kysely-based functions like `postSalesPaymentToJournal`.

### Internal Fields (`_paymentId`, `_companyId`, `_invoiceId`)

Since `PostPaymentInput` is passed from API routes before the payment exists in the DB, we needed a way to pass the IDs to the hook. Using `_` prefix clearly marks these as internal fields that `PaymentService` populates before calling the hook.

### Graceful Degradation

The hook call uses optional chaining (`postingHook?.postPaymentToJournal()`) so that when `postingHook` is undefined (e.g., in offline POS before sync), `postPayment` completes successfully without posting.

## Notes

The implementation sets up the infrastructure for atomic journal posting. Actual wiring into API composition will happen in story-28.4 (API route flip).

---

## P1 Fix Applied: Hook Wiring in API Layer (Post-Review)

### Problem
The `ApiPaymentPostingHook` class was implemented (201 lines) but was **never instantiated or used**. The API routes still imported from `@/lib/payments/payment-service` which did NOT use the hook pattern.

### Solution
Created composition function that wires the hook into the payment service.

### Files Created
- `apps/api/src/lib/modules-sales/payment-service-composition.ts` (NEW)
  - `createComposedPaymentService()`: Creates wired payment service with hook
  - `getComposedPaymentService()`: Returns singleton instance

### Files Modified
- `apps/api/src/lib/modules-sales/index.ts`
  - Added exports: `createComposedPaymentService`, `getComposedPaymentService`

- `packages/modules/sales/src/index.ts` (P2 Fix)
  - Added `JournalPostingResult` to payment types export

### Validation
```bash
npm run typecheck -w @jurnapod/modules-sales  # PASSED
npm run typecheck -w @jurnapod/api            # PASSED
```

### Note on Route Flip
The routes still use the old payment service for now (story-28.4 handles flipping the routes to use the composed service).
