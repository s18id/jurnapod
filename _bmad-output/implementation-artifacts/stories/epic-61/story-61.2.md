# Story 61.2: Sales Payment Lifecycle & FX Correctness

**Status:** ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 61 --story 61-2 --status done --title sales-payment-lifecycle-fx-correctness`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`

---

## Story

As a **financial auditor**,  
I want **sales payment lifecycle transitions to be valid, idempotent, and FX-delta-aware**,  
So that **posted payments have balanced journal effects and cannot be silently mutated**.

## Context

- Source: Epic 61 (FR2, FR5) — Sales & Purchasing Lifecycle Correctness
- Depends on: Story 61.1 (invoice lifecycle establishes patterns)
- Scope: `apps/api/src/routes/sales/payments.ts`, `@jurnapod/modules-sales`, `@jurnapod/modules-accounting`
- Risk: P0 — incorrect payment lifecycle or FX handling corrupts AR balances
- Predecessor: Epic 57 Story 57.2 (AR invoice-payment posting correctness), Story 57.3 (AR credit/void/refund)

### Lifecycle State Machine

```
PENDING ──[post]──► POSTED ──[void]──► VOID
   │                    │
   └──[mutate]──✔       └──[mutate]──✖ (immutable)
```

### FX Delta Flow

```
Payment created (base currency) ──► FX rate applied ──► Delta recorded
   │                                                       │
   └── Payment acknowledged ◄── Delta accepted/rejected ◄──┘
```

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| PENDING→POSTED with journal entries | Happy | Integration |
| POSTED→VOID with reversal | Happy | Integration |
| POSTED payment rejects mutation | Error | Integration |
| FX delta acknowledgment workflow | Happy | Integration |
| FX delta rejection reverts payment | Error | Integration |
| Duplicate payment (idempotency via client_tx_id) | Edge | Integration |
| CASHIER cannot void payment | Error | Integration |
| Payment to closed fiscal year rejected | Error | Integration |

---

## Acceptance Criteria

**AC1: PENDING→POSTED creates balanced journal entries**
**Given** a payment in PENDING status,
**When** it is posted,
**Then** status transitions to POSTED,
**And** journal entries debit bank/cash and credit AR (balanced).

**AC2: POSTED payments reject field mutation**
**Given** a payment in POSTED status,
**When** any mutation is attempted,
**Then** the request is rejected with 409 CONFLICT.

**AC3: POSTED→VOID creates reversal journals**
**Given** a payment in POSTED status,
**When** voided,
**Then** status transitions to VOID,
**And** reversal journal entries are created (debiting AR, crediting bank/cash).

**AC4: FX delta acknowledgment workflow**
**Given** a payment with FX rate that differs from invoice rate,
**When** the FX delta is acknowledged,
**Then** the delta is recorded in `sales_payments_fx_ack`,
**And** the payment journal reflects the settled amount.

**AC5: Payment idempotency via client_tx_id**
**Given** a payment already processed,
**When** the same `client_tx_id` is submitted again,
**Then** the duplicate is detected and returns DUPLICATE (not OK).

**AC6: Void uses DELETE permission**
**Given** a user without DELETE on sales.payments,
**When** void is attempted,
**Then** the request is rejected with 403.

---

## Tasks / Subtasks

- [ ] Task 1: Audit existing payment code (AC: all)
- [ ] Task 2: Implement lifecycle guards (AC: 1,2,3)
- [ ] Task 3: Verify FX delta workflow (AC: 4)
- [ ] Task 4: Verify idempotency (AC: 5)
- [ ] Task 5: Integration tests (AC: all)

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/sales/payments.ts` | Modify | Lifecycle guards, DELETE permission |
| `packages/modules/sales/src/` | Audit | Payment service lifecycle |
| `apps/api/__test__/integration/sales/` | Create | Payment lifecycle integration tests |

## Dev Notes

- Payment route was recently fixed in Epic 60 (added requireAccess with resource param)
- FX delta workflow uses `sales_payments_fx_ack` table
- Idempotency uses `client_tx_id` pattern (same as POS sync)
- Void permission uses DELETE bit=8 per Epic 60 ACL convention

## Dependencies

- Story 61.1 (invoice lifecycle patterns and conventions)
- Epic 57 Stories 57.2, 57.3 (AR correctness baseline)

## Risk Level

P0 — Incorrect payment lifecycle or FX handling corrupts AR balances
