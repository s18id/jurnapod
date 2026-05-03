# Story 54.2: AP Payment Write-Path Correctness Hardening

> **HARD GATE (E54-A2):** Implementation of this story MUST NOT begin until the E54-A2 second-pass review checklist is included below.

**Status:** backlog

---

## Story Context

**Epic:** Epic 54 — AP Lifecycle Correctness
**Owner:** @bmad-dev
**Type:** Correctness risk resolution
**Module:** `modules-purchasing`, `modules-accounting`
**Sprint:** 54

---

## Problem Statement

AP payment create → post → allocate is the most complex AP write path. Payment allocation to multiple invoices, partial payments, and overpayment handling all have correctness risks. This story proves the payment path is correct, idempotent, and produces accurate invoice balance updates.

---

## E54-A2: Second-Pass Determinism Review (MANDATORY)

**When required:** Payment allocation corrupting invoice balances is a P0 risk. Second-pass review is **MANDATORY**.

**Second-pass checklist:**
- [ ] Payment create idempotency proven
- [ ] Payment post produces correct GL entries (debit AP, credit bank)
- [ ] Partial payment reduces invoice open amount correctly
- [ ] Full payment sets invoice balance to zero
- [ ] Overpayment is rejected or handled per business rules
- [ ] Multi-invoice allocation is proportional and correct
- [ ] Concurrent payment post with same ID is safe
- [ ] No `Date.now()` or `Math.random()` introduced during fix
- [ ] 3× consecutive green evidence on AP payment integration suite
- [ ] No post-review fixes expected after second-pass sign-off

---

## Acceptance Criteria

**AC1:** Payment create idempotency proven
- **Given** a payment is created with `idempotency_key = "pay-abc123"`
- **When** a second create request arrives with the same key
- **Then** the second request returns the same payment (no duplicate)

**AC2:** Payment post produces correct GL entries
- **Given** a draft payment of $500.00 to a bank account
- **When** the payment is posted
- **Then** the journal batch contains:
  - Debit AP control account: $500.00
  - Credit bank account: $500.00
  - Batch total debits = total credits

**AC3:** Partial payment reduces invoice open amount correctly
- **Given** an invoice with open amount $1,000.00
- **When** a payment of $300.00 is allocated to the invoice
- **Then** the invoice open amount becomes $700.00
- **And** the invoice status remains POSTED (not PAID)

**AC4:** Full payment sets invoice balance to zero
- **Given** an invoice with open amount $500.00
- **When** a payment of $500.00 is allocated to the invoice
- **Then** the invoice open amount becomes $0.00
- **And** the invoice status remains POSTED (Epic 46 design: no PAID status)

**AC5:** Overpayment is rejected
- **Given** an invoice with open amount $300.00
- **When** a payment allocation of $400.00 is attempted
- **Then** the request is rejected with 400 and clear error message

**AC6:** Payment allocation to multiple invoices is proportional
- **Given** two invoices: Inv-A ($300 open), Inv-B ($700 open)
- **When** a payment of $500 is allocated: $200 to A, $300 to B
- **Then** Inv-A open amount = $100; Inv-B open amount = $400
- **And** total allocated = $500

**AC7:** Concurrent payment post with same ID is safe
- **Given** two concurrent post requests for the same draft payment
- **When** both requests arrive simultaneously
- **Then** exactly one post succeeds; the second returns idempotent success or conflict

**AC8:** Integration tests written and 3× consecutive green

**AC9:** Code review GO required

---

## Test Coverage Criteria

- [ ] Happy paths:
  - [ ] Create draft payment → post → verify journal
  - [ ] Partial payment → verify invoice balance reduced
  - [ ] Full payment → verify invoice balance zero
  - [ ] Multi-invoice allocation → verify proportional split
- [ ] Error paths:
  - [ ] 400: Overpayment allocation rejected
  - [ ] 400: Payment with inactive bank account
  - [ ] 400: Payment with zero allocation amount
  - [ ] 409: Concurrent post race

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/purchasing/ap-payment-correctness.test.ts` | Create | New integration test suite for payment correctness |

## Estimated Effort

3 days

## Risk Level

High (P0 — payment allocation corrupts invoice balances)

## Dev Notes

- Existing `ap-payments.test.ts` has 1848 lines — it's comprehensive for features but not correctness proofs
- Payment allocation correctness: verify `payment_allocations` table rows + invoice balance updates
- Use `toScaled` / `fromScaled` for monetary precision in assertions
- Concurrent post: use `Promise.allSettled` pattern from Epic 51 fiscal-year-close tests

## Dependencies

- Story 54.1 (invoice correctness) — should be done first or concurrent
- Canonical payment fixtures in `modules-purchasing`

## Validation Evidence

```bash
npm run test:single -w @jurnapod/api -- "__test__/integration/purchasing/ap-payment-correctness.test.ts"
```
