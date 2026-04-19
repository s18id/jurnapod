# Story 46.6: AP Payments

Status: backlog

## Story

As an **accountant**,  
I want to record payments to suppliers against purchase invoices,  
So that AP balance is reduced and bank/cash GL entries are created.

---

## Context

Story 46.6 adds the AP Payment entity. Payments reduce the AP Trade balance (D: AP Trade, C: Bank/Cash). Payments can pay full or partial PI amounts. All journal entries are in company base currency.

Payments follow the repo's immutability rule for finalized financial documents: create in DRAFT, POST to finalize, VOID to reverse.

**Dependencies:** Story 46.5 (PI posted, journal created, AP balance exists)

---

## Acceptance Criteria

**AC1: AP Payment Creation**
**Given** a user with `purchasing.payments` CREATE permission,
**When** they create an AP payment with payment_date, bank_account_id, lines (pi_id, amount_paid),
**Then** an AP payment is created with status DRAFT,
**And** for each line: amount_paid is allocated against the PI's open balance.

**AC2: Payment Posting (Journal Creation)**
**Given** an AP payment is in DRAFT status,
**When** the payment is posted,
**Then** a journal batch is created with:
- Per payment line: `D: AP Trade` `C: Bank/Cash (bank_account_id)`
- All amounts in company base currency
- Payment date = journal effective date
**And** payment status becomes POSTED.

**AC3: Partial Payment**
**Given** a PI has balance of 1000.00,
**When** a payment of 400.00 is allocated to it,
**Then** the PI balance becomes 600.00 (remaining AP),
**And** the payment line records amount_paid = 400.00.

**AC4: Full Payment**
**Given** a PI has balance of 1000.00,
**When** a payment of 1000.00 is allocated to it,
**Then** the PI balance becomes 0 (fully paid),
**And** PI status transitions to PAID (or remains POSTED with balance=0).

**AC5: Multiple PIs One Payment**
**Given** a payment covers multiple PIs,
**When** the payment is created,
**Then** one journal batch is created with D/C pairs for each PI line,
**And** each PI's balance is reduced by its allocated amount.

**AC6: Bank/Cash Account**
**Given** a payment references bank_account_id,
**When** the journal is created,
**Then** the credit side uses the specified bank/cash account from `treasury.accounts`.
**If** bank_account_id is not provided → 400 error (payment account required).

**AC7: AP Balance Check**
**Given** a payment attempts to overpay a PI (amount_paid > PI balance),
**When** the payment is saved,
**Then** an error is returned: overpayment not allowed,
**And** the payment is rejected.

**AC8: ACL Enforcement**
**Given** a user without `purchasing.payments` permission,
**When** they attempt to create a payment,
**Then** they receive 403.

**AC9: Payment Void**
**Given** a posted AP payment,
**When** it is voided,
**Then** a reversal journal batch is created,
**And** the PI balances are restored by the voided amount,
**And** the payment status becomes VOID.

---

## Tasks / Subtasks

- [ ] Create `ap_payments` and `ap_payment_lines` table migrations
- [ ] Add ACL resource `purchasing.payments`
- [ ] Implement AP payment routes (create, post, void)
- [ ] Create journal batch on payment post
- [ ] Create reversal journal batch on payment void
- [ ] Implement balance check (overpayment rejection)
- [ ] Write integration tests for payment → journal creation
- [ ] Write integration tests for partial payment balance tracking
- [ ] Write integration tests for journal balancing

---

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/routes/purchasing/ap-payments.ts` | AP payment routes |
| `apps/api/src/lib/purchasing/ap-payment.ts` | Payment logic + journal creation |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/kysely/schema.ts` | Modify | Add ap_payments, ap_payment_lines |
| `packages/shared/src/schemas/purchasing.ts` | Modify | Add AP payment schemas |
| `packages/auth/src/**/*` | Modify | Align payments permissions with the approved ACL mapping |

---

## Validation Evidence

```bash
# Create AP payment (DRAFT)
curl -X POST /api/purchasing/payments \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"payment_date": "2026-04-19", "bank_account_id": 5, "lines": [{"pi_id": 1, "amount_paid": "560.00"}]}'

# Post AP payment
curl -X POST /api/purchasing/payments/1/post -H "Authorization: Bearer $TOKEN"

# Verify PI balance updated
curl /api/purchasing/invoices/1 -H "Authorization: Bearer $TOKEN"
# Expected: balance: 0.00 (if full payment)

# Verify journal created
curl /api/journals/batches/124 -H "Authorization: Bearer $TOKEN"
# Expected: D: AP Trade 560, C: Bank 560

# Overpayment test
curl -X POST /api/purchasing/payments \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"payment_date": "2026-04-19", "bank_account_id": 5, "lines": [{"pi_id": 1, "amount_paid": "999999.00"}]}'
# Expected: 400 overpayment not allowed
```

---

## Dev Notes

- `ap_payments.status`: DRAFT → POSTED → VOID
- Payment date = journal effective date (used for period locking)
- `ap_payment_lines.amount_paid` is in company base currency
- PI balance stored on PI record: `balance = total_converted_amount - sum(paid_amounts)`
- Multiple PIs per payment = one journal batch with multiple D/C pairs
- Overpayment check: `sum(amount_paid) <= PI.balance` per line
- VOID restores PI balances and creates a reversing journal batch

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] Journal batch balanced — verify debits = credits
- [ ] No `as any` casts added without justification
