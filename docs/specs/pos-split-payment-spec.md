# POS Split Payment - Implementation Specification

## Problem Statement

Currently, the POS checkout UI only supports a single payment method per transaction. Customers who want to split payment (e.g., Rp 50,000 cash + Rp 50,000 QRIS for a Rp 100,000 order) cannot do so directly from the UI.

## Background

- Backend already supports split payments at the sync contract level
- `pos_transaction_payments` table stores each payment method as a separate row
- Journal posting groups by method, creating separate debit lines

## Implementation Detail

### 1. State Management

**Location**: `apps/pos/src/features/cart/useCart.ts`

```ts
// Add to UseCartReturn
payments: Array<{ method: string; amount: number }>;
setPayments: (payments: Array<{ method: string; amount: number }>) => void;

// Default state
const defaultPayments = [{ method: paymentMethods[0] ?? "CASH", amount: 0 }];
```

### 2. UI Components

**Location**: `apps/pos/src/features/checkout/CheckoutForm.tsx`

```
┌─────────────────────────────────────────┐
│ Payment                                  │
│ ┌─────────────────────────────────────┐ │
│ │ [CASH    ] Rp 50,000           [x] │ │
│ │ [QRIS    ] Rp 50,000           [x] │ │
│ └─────────────────────────────────────┘ │
│ [+ Add Payment Method]                  │
│                                         │
│ Remaining: Rp 0                         │
│ ┌─────────────────────────────────────┐ │
│ │         Complete sale offline        │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Validation Rules**:
- At least 1 payment required
- Sum of all payments must equal grand_total
- Each payment method must be in allowed methods list
- Cannot remove last payment row

### 3. Quick Amount Buttons

**Location**: `apps/pos/src/features/checkout/QuickAmountButtons.tsx`

In split mode:
- Show "Pay remaining" button
- When clicked, fills remaining amount on currently focused/selected row

### 4. Checkout Completion

**Location**: `apps/pos/src/features/checkout/useCheckout.ts`

```ts
// Before (single payment)
payments: [
  {
    method: paymentMethod,
    amount: cartTotals.paid_total
  }
]

// After (supports both)
payments: payments.map(p => ({
  method: p.method,
  amount: p.amount
}))
```

### 5. Sync Payload (Already Works)

```json
{
  "outlet_id": 1,
  "transactions": [{
    "client_tx_id": "uuid",
    "company_id": 1,
    "outlet_id": 1,
    "cashier_user_id": 10,
    "status": "COMPLETED",
    "trx_at": "2026-03-13T10:00:00.000Z",
    "items": [...],
    "payments": [
      { "method": "CASH", "amount": 50000 },
      { "method": "QRIS", "amount": 50000 }
    ]
  }]
}
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Payments sum < grand_total | Disable complete, show "Remaining: Rp X" |
| Payments sum > grand_total | Show error "Overpayment: Rp X" |
| Empty payments | Disable complete |
| Invalid method | Reject (shouldn't happen with dropdown) |

## Testing Plan

### Unit Tests
- `useCart.ts`: split payment state transitions
- `CheckoutForm.tsx`: validation logic

### Integration Tests
- Sync push with multiple payment methods
- Duplicate replay with split payments

### Manual QA
1. Add item Rp 100,000
2. Add CASH Rp 50,000 + QRIS Rp 50,000
3. Complete sale
4. Verify sync payload has both methods
5. Verify backoffice shows both in payment breakdown
