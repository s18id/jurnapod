# Story 57.4: Treasury Handoff + Reconciliation Correctness

**Status:** done

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 57 --story 57-4 --status done`
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts`

---

## Story

As a **finance operations team**,  
I want **AR payments to correctly debit the customer's receivable account and credit the treasury cash/bank account**,  
So that **AR subledger and treasury cash account always reconcile and no funds are lost or duplicated**.

---

## Context

**Source:** Epic 57 kickoff; Sprint 57 AR + Treasury Correctness

**Background:** Treasury handles cash/bank movements. AR payments (from Story 57.2) create treasury-side journal entries: cash account credited (money in). Treasury handoff must be consistent: when AR records a payment, the cash account balance matches what treasury expects.

**AR→Treasury relationship:**
- AR Invoice: Dr. Accounts Receivable (customer) | Cr. Revenue
- AR Payment: Dr. Cash/Bank (treasury) | Cr. Accounts Receivable (customer)
- Net effect: Revenue credited, Cash debited — enterprise view is consistent

**Treasury correctness concerns:**
- Cash account balance = sum of all treasury transactions on that account
- AR payment cash credit must match treasury receipt
- Bank reconciliation: treasury cash balance matches bank statement

**Pattern from Epic 56:** The `cash_bank_transactions` table and associated triggers were introduced in earlier epics. This story focuses on correctness of the AR→treasury handoff and reconciliation.

**Handoff mechanism:** AR payment (Story 57.2) posts the journal entry via `ApiPaymentPostingHook.postPaymentToJournal()`. Within the same transaction, a `cash_bank_transactions` row is created with `transaction_type='MUTATION'`, `source_account_id=payment.account_id` (cash/bank GL), `destination_account_id=customer receivable account`. The atomic dual-write ensures treasury balance and GL cash account are always consistent — no eventual consistency window.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** AR payment cash credited to treasury account, treasury balance matches sum of AR payments, bank reconciliation passes
- [ ] **Error paths identified:** Unbalanced journal (treasury entry doesn't balance), treasury cash account not found, concurrent treasury transactions causing balance discrepancy
- [ ] **Edge cases identified:** Multi-payment allocation to single invoice, partial treasury receipt, treasury account closure with open balances
- [ ] **Test fixture needs identified:** Treasury bank account, treasury transaction history, AR payment fixtures
- [ ] **Integration test scope defined:** Real DB required (journal balance, treasury balance, reconciliation queries)
- [ ] **Negative auth test role selected:** `ACCOUNTANT` (has treasury.READ but not treasury.MANAGE — appropriate for reconciliation)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| AR payment credits treasury cash account (balanced journal) | Happy | Integration |
| Treasury cash balance = sum of AR payments credited to that account | Happy | Integration |
| Bank reconciliation: treasury sum matches GL cash account balance | Happy | Integration |
| Treasury cash account not found → 400 | Error | Integration |
| Treasury account inactive → 400 | Error | Integration |
| Concurrent AR payments to same cash account — no balance race | Edge | Integration |
| Treasury account balance goes negative → 400 | Error | Edge |
| Treasury VOID via POST /cash-bank-transactions/{id}/void — immutability preserved | Happy | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [ ] **Modules touched:** `modules-sales` (AR payment), `modules-treasury` (bank accounts, cash balance), `modules-accounting` (journal), `modules-platform` (company)
- [ ] **Cross-module decisions identified:**
  1. AR payment cash account selected from `treasury_bank_accounts` (explicit, not default)
2. Treasury balance is derived from sum of `cash_bank_transactions` entries (not a separate balance column)
3. AR payment creates `cash_bank_transactions` entry with `transaction_type='MUTATION'`
4. Bank reconciliation: run reconciliation query comparing `cash_bank_transactions` sum to GL cash account balance
- [ ] **Winston sign-off obtained:** Awaiting
- [ ] **Decisions recorded:** Per table below

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | AR payment cash account from `treasury_bank_accounts.id` (explicit selection) | sales, treasury | Explicit selection ensures correct bank account credited; matches Epic 56 payment pattern | Default cash account (no selection — risks wrong account) | pending |
| 2 | Treasury balance = sum of `cash_bank_transactions` entries (derived, not column) | treasury, accounting | Derived balance is always accurate; no sync risk between balance column and transactions | Separate `balance` column (can go stale) | pending |
| 3 | AR payment creates `cash_bank_transactions` row with `transaction_type='MUTATION'` | treasury, sales | Explicit transaction type enables reconciliation queries; audit trail | Generic cash receipt type (less precise) | pending |
| 4 | Bank reconciliation: treasury sum vs GL cash account balance | treasury, accounting | Reconciliation proof that AR payment treasury entry matches GL cash account | Separate reconciliation table (additional sync risk) | pending |

**Hard gate:** These cross-module decisions are advisory — decisions should be reviewed and confirmed before implementation begins to avoid rework. Sign-off status: `pending`.

---

## Acceptance Criteria

**AC1: AR payment credits treasury cash account**
**Given** a valid AR payment with `treasury_bank_account_id` selected
**When** POST `/sales/payments` is called
**Then** `cash_bank_transactions` row is created: `transaction_type='MUTATION'`, `destination_account_id=treasury_bank_account_id`, amount credited
**And** journal entry is balanced: debit cash, credit receivable

**AC2: Treasury balance derived from transaction sum**
**Given** a treasury bank account with multiple AR payments credited
**When** `SELECT SUM(amount) FROM cash_bank_transactions WHERE destination_account_id=? AND company_id=? AND status='POSTED'` is queried
**Then** the sum equals the balance shown for that bank account in treasury views

**AC3: AR payment handoff to treasury is consistent**
**Given** an AR payment of $500 credited to bank account X
**When** treasury bank account X balance is queried via `SUM(amount)`
**Then** the balance reflects +$500 from this AR payment
**And** the receivable account shows -$500 (payment applied to customer)

**AC4: AR payment does not cause treasury balance race**
**Given** two concurrent AR payments to the same treasury bank account
**When** both payments are posted simultaneously
**Then** both succeed
**And** treasury account balance = sum of both transactions (no race condition)

**AC5: Treasury cash account validation**
**Given** an AR payment with `treasury_bank_account_id` referencing a non-existent account
**When** POST `/sales/payments` is called
**Then** response is `400 Bad Request` with validation error

**AC6: Treasury cash account inactive check**
**Given** an AR payment with `treasury_bank_account_id` referencing an inactive account
**When** POST `/sales/payments` is called
**Then** response is `400 Bad Request` with error indicating account inactive

**AC7: Bank reconciliation correctness**
**Given** a treasury bank account with known transaction history (AR payments, manual treasury entries)
**When** the reconciliation is verified by comparing:
1. `SELECT SUM(amount) FROM cash_bank_transactions WHERE destination_account_id=? AND company_id=? AND status='POSTED'`
2. The corresponding GL cash account balance from journal entries
**Then** both sums match (variance = 0) when AR payments are correctly posted (balanced journals, no missing entries)

**AC8: AR payment with no treasury_bank_account_id → 400**
**Given** an AR payment request without `treasury_bank_account_id`
**When** POST `/sales/payments` is called
**Then** response is `400 Bad Request` with validation error

**AC9: Treasury transaction immutability (VOID pattern)**
**Given** a POSTED treasury transaction (AR payment)
**When** POST `/cash-bank-transactions/{id}/void` is called to void the transaction
**Then** response is `200 OK` with void confirmation
**And** a new correction treasury transaction is created (not mutation of the original)

**AC10: Code review GO required**

---

## Test Coverage Criteria

- [ ] Coverage target: all treasury handoff and reconciliation paths
- [ ] Happy paths to test:
  - [ ] AR payment creates treasury transaction row
  - [ ] Treasury balance = sum of AR payments
  - [ ] Bank reconciliation shows zero variance
  - [ ] Concurrent AR payments do not cause balance race
- [ ] Error paths to test:
  - [ ] 400: invalid treasury_bank_account_id
  - [ ] 400: inactive treasury account
  - [ ] 400: missing treasury_bank_account_id
  - [ ] 409: mutation of completed treasury transaction

---

## Test Fixtures

### Pre-Implementation Checklist
- [ ] New patterns identified: treasury bank account, treasury transaction history, AR payment with treasury_bank_account_id
- [ ] Existing canonical fixtures reviewed: AR customer fixture, AR payment fixture from Story 57.2
- [ ] Fixture location: `packages/modules-treasury/src/test-fixtures/` (owner package for treasury domain)

### Fixture Creation/Update
- [ ] **New fixtures needed:**
  - [ ] Pattern: Active treasury bank account with known balance
  - [ ] Pattern: Multiple treasury transactions (for reconciliation tests)
  - [ ] Pattern: AR payment with explicit `treasury_bank_account_id`

---

## Tasks / Subtasks

- [ ] Create treasury bank account fixture in `packages/modules-treasury/src/test-fixtures/`
- [ ] Create treasury transaction history fixture (multiple transactions for balance verification)
- [ ] Write integration tests for AC1–AC10 (real DB required — treasury balance, reconciliation)
- [ ] Verify treasury handoff dual-write is correctly implemented in `ApiPaymentPostingHook.postPaymentToJournal()` (`apps/api/src/lib/modules-sales/payment-posting-hook.ts:211-235`) — treasury row created atomically with journal entry in same transaction
- [ ] Run `npm run lint -w @jurnapod/api` and `npm run typecheck -w @jurnapod/api`
- [ ] Code review with no P0/P1 blockers

---

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/treasury/src/test-fixtures/treasury-fixtures.ts` | Treasury bank account, transaction history fixtures |
| `apps/api/__test__/integration/treasury/treasury-reconciliation.test.ts` | Treasury handoff + reconciliation tests |

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/treasury/src/index.ts` | Export | Add treasury fixtures |

---

## Estimated Effort

1 day

## Risk Level

High (P1 — treasury balance correctness is financial integrity concern)

## Dev Notes

- **Treasury balance model:** Balance is derived from `SUM(amount)` of `cash_bank_transactions` WHERE `destination_account_id=? AND status='POSTED'`. No separate `balance` column is maintained. This is by design — derived balance is always accurate.
- **AR payment cash credit:** When AR payment is posted (Story 57.2), it creates:
  1. Journal entry: Dr. Cash/Bank (treasury account), Cr. Accounts Receivable
  2. `cash_bank_transactions` row: `transaction_type='MUTATION'`, `destination_account_id=treasury_bank_account_id`, amount credited
- **Bank reconciliation:** Compares `SUM(cash_bank_transactions.amount)` to the GL cash account balance for that bank account. Variance = 0 when AR payments are posted correctly.
- **Tenant isolation:** All treasury queries include `company_id` filter.

## Cross-Cutting Concerns

### Audit Integration
- [x] Audit events required: AR payment credited to treasury account
- [x] Audit fields: `company_id`, `destination_account_id`, `transaction_type='MUTATION'`, `amount`
- [x] Audit tier: `MASTER` (cash movements)

### Idempotency
- [x] Idempotency key: `client_ref` (from AR payment — same idempotency service as sales module)

### Validation Rules
- [x] `treasury_bank_account_id` must exist, be active, and belong to the company
- [x] AR payment amount must match `amount` in both journal entry and `cash_bank_transactions`

## Validation Evidence

```bash
# Run treasury handoff + reconciliation tests
npm run test:single -- "apps/api/__test__/integration/treasury/treasury-reconciliation.test.ts" -w @jurnapod/api

# Verify lint and typecheck
npm run lint:migrations && npm run lint -w @jurnapod/api && npm run typecheck -w @jurnapod/api
```

---

## Dependencies

- Story 57.1 complete (trigger 0201 verified for AR)
- Story 57.2 complete (AR payment posting correct)
- Treasury bank account fixtures exist
- `cash_bank_transactions` table confirmed

---

## Technical Debt Review

- [ ] No shortcuts taken
- [ ] No `TODO`/`FIXME` comments left
- [ ] Integration tests for all AC paths
- [ ] All new debt items added to registry

---

_Last Updated: 2026-05-05_