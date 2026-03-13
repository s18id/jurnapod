# POS Split Payment Implementation Plan

## Overview

Enable cashiers to split payments across multiple methods (e.g., half cash, half QRIS) directly from the POS checkout UI.

## Current State

### Backend (Already Supported)
- **Sync contract**: `payments` is already an array (`packages/shared/src/schemas/pos-sync.ts:61`)
- **Offline DB**: `CompleteSalePaymentInput` supports array (`packages/offline-db/dexie/types.ts:287`)
- **completeSale()**: Already maps `input.payments` array to `PaymentRow` (`apps/pos/src/offline/sales.ts:258`)
- **API posting**: Groups by method and creates per-method debit lines (`apps/api/src/lib/sync-push-posting.ts:340`, `:447`)

### POS UI (Current Limitation)
- `CheckoutForm.tsx` only accepts single payment method via `PaymentMethodPicker`
- `useCheckout.ts` builds single-element payments array (line 182-186)
- No UI for adding/removing payment rows

## Scope

### Phase 1: Data Model & State Management (No UI)

**File**: `packages/offline-db/dexie/types.ts`
- Already supports array - no changes needed

**File**: `apps/pos/src/features/cart/useCart.ts`
- Add state for multiple payments:
  ```ts
  interface PaymentEntry {
    method: string;
    amount: number;
  }
  payments: PaymentEntry[];
  setPayments: (payments: PaymentEntry[]) => void;
  ```

### Phase 2: UI Components

**File**: `apps/pos/src/features/checkout/PaymentMethodPicker.tsx`
- Convert to render list of payment entries
- Add "Add payment method" button
- Add remove button per row

**File**: `apps/pos/src/features/checkout/CheckoutForm.tsx`
- Render multiple payment inputs
- Show remaining amount to pay
- Validate sum equals grand_total

**File**: `apps/pos/src/features/checkout/QuickAmountButtons.tsx`
- Handle split scenarios:
  - Single method: full amount buttons
  - Split mode: remaining amount buttons

### Phase 3: Checkout Integration

**File**: `apps/pos/src/features/checkout/useCheckout.ts`
- Change `payments` from single object to array
- Pass full array to `completeSale()`

### Phase 4: Testing

- Unit test: split payment validation (sum must equal grand_total)
- Integration test: sync push with multiple payment methods
- Manual test: half cash / half QRIS checkout flow

## Acceptance Criteria

1. Cashier can add 2+ payment methods in checkout
2. Each method shows method selector and amount input
3. Total of all payment amounts must equal grand_total
4. "Complete sale" disabled until payments sum correctly
5. Sync push accepts and posts multiple payment methods
6. Backoffice reports show correct payment method breakdown

## Files to Modify

| File | Change |
|------|--------|
| `apps/pos/src/features/cart/useCart.ts` | Add `payments` state |
| `apps/pos/src/features/checkout/PaymentMethodPicker.tsx` | Support multiple entries |
| `apps/pos/src/features/checkout/CheckoutForm.tsx` | Render split payment UI |
| `apps/pos/src/features/checkout/useCheckout.ts` | Pass payments array |
| `apps/pos/tests/split-payment.test.ts` | Add unit tests |

## Backward Compatibility

- Single payment method (existing behavior) continues to work
- API contract unchanged (already supports array)
- Offline DB schema unchanged
