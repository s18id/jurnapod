# Story 57.3: AR Credits/Void/Refund Invariants

**Status:** planned

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 57 --story 57-3 --status done`
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts`

---

## Story

As a **finance operations team**,  
I want **AR credit notes, voids, and refunds to create new accounting effects (not mutate original records)**,  
So that **the ledger remains auditable and the AR subledger stays consistent with immutable finalized records**.

---

## Context

**Source:** Epic 57 kickoff; Sprint 57 AR + Treasury Correctness

**Background:** AR corrections (credit notes, voids, refunds) must follow the immutable finalized record pattern (VOID/REFUND, not mutation). Original amounts stay in the ledger; corrections create new offsetting entries.

**Pattern established in AP:** Epic 55 proved the VOID/REFUND pattern for AP corrections. Epic 56's trigger 0201 blocks mutation on `ap_reconciliation_snapshots`. The same pattern applies to AR.

**AR correction types:**
- **Credit note:** Creates new journal entries crediting receivable (reversal of original invoice) — amount offset by credit note lines
- **Void:** Marks original invoice as voided in audit trail; no journal entries changed; original entries remain
- **Refund:** Payment reversal — creates new journal entries debiting receivable (reversal of original payment)

**Key invariant:** Original finalized records are NEVER modified. Corrections create new entries.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:** Credit note creation (new entries), void (audit trail), refund deferred to 57.4
- [ ] **Error paths identified:** Mutation of POSTED invoice (409), credit note on already-credit-matched invoice, refund exceeds original payment amount, void of already-voided invoice
- [ ] **Edge cases identified:** Partial credit, void of already-voided invoice
- [ ] **Test fixture needs identified:** AR customer with paid invoice, partial payment balance, credit note with lines
- [ ] **Integration test scope defined:** Real DB required (journal entries, audit trail, immutability enforcement)
- [ ] **Negative auth test role selected:** `CASHIER` (lowest sales permissions; appropriate for correction flows)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| AR credit note creates new journal entries (not mutation) | Happy | Integration |
| AR void marks original as voided — no ledger amounts changed | Happy | Integration |
| AR refund — out of scope for Epic 57 (deferred) | Error | N/A |
| Credit note on POSTED invoice — new entries created | Error | Integration |
| Void on ALREADY_VOIDED invoice returns 409 | Error | Edge |
| Refund amount exceeds original payment → 400 | Error | Integration |
| Audit trail entry recorded for credit note and void | Happy | Integration |
| POSTED invoice cannot be mutated — 409 returned | Error | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [ ] **Modules touched:** `modules-sales` (credit/void/refund), `modules-accounting` (journal), `modules-platform` (company/customer), `packages/db` (trigger)
- [ ] **Cross-module decisions identified:**
  1. Credit note uses same `receivable_account_id` as original invoice (customer's receivable)
  2. Refund amount capped at original payment amount (no over-refund)
  3. Void records actor + timestamp on `sales_invoice.voided_at`/`voided_by`; `audit_logs` entry for entity_type=`sales_invoice`, action=`VOID`
  4. All corrections require POSTED invoice/payment (not DRAFT)
- [ ] **Winston sign-off obtained:** Awaiting
- [ ] **Decisions recorded:** Per table below

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Winston Sign-Off |
|---|----------|-----------------|-----------|------------------------|-----------------|
| 1 | Credit note uses original invoice's customer `receivable_account_id` | sales, accounting | Customer receivable account is the counterparty; credit note reduces AR balance | Separate credit note receivable account (inconsistent) | pending |
| 2 | Refund amount ≤ original payment amount (no over-refund) | sales, treasury | Over-refund would cause AR subledger to go negative beyond payment | Allow over-refund (risks AR balance integrity) | pending |
| 3 | Void records actor + timestamp on invoice record; audit_log entry for entity_type=`sales_invoice`, action=`VOID` | accounting, sales | Immutable ledger principle — void is annotation, not reversal; actor tracking is required | Reversal journal entries (changes ledger totals) | pending |
| 4 | All corrections require POSTED status (not DRAFT) | sales | Corrections apply to finalized financial records | Allow corrections on DRAFT (risks incomplete records) | pending |

**Hard gate:** These cross-module decisions are advisory — decisions should be reviewed and confirmed before implementation begins to avoid rework. Sign-off status: `pending`.

---

## Acceptance Criteria

**AC1: AR credit note creates new journal entries (not mutation)**
**Given** a POSTED AR invoice with outstanding balance
**When** POST `/sales/credit-notes` is called with `type='ar_credit_note'` and credit line items
**Then** new journal entries are created: credit to customer's `receivable_account_id`, debit to credit note revenue/expense account
**And** original invoice journal entries remain unchanged (immutable ledger)
**And** `audit_logs` receives entry for the credit note event (entity_type=`sales_invoice`, action=`CREDIT_NOTE`)

**AC2: AR credit note idempotency**
**Given** a duplicate POST to `/sales/credit-notes` with same `client_ref`
**When** the first request succeeded
**Then** the second request returns `200 OK` with `{ duplicate: true }` and no second journal entry

**AC3: AR void marks original as voided (no ledger change)**
**Given** a POSTED AR invoice
**When** POST `/sales/invoices/{id}/void` is called
**Then** invoice status is updated to `VOID`
**And** `invoice.voided_at` is set and `invoice.voided_by` records the actor
**And** `audit_logs` receives entry for the void event (entity_type=`sales_invoice`, action=`VOID`)
**And** original journal entries remain in ledger (unchanged amounts)

> **Note:** `voided_at`/`voided_by` columns added via migration `0203_sales_invoices_voided_at_by.sql`. The `audit_logs` write for VOID is implemented in `ApiSalesDbExecutor.updateInvoiceStatus()` (`apps/api/src/lib/modules-sales/sales-db.ts:580-590`) — the VOID branch of `updateInvoiceStatus` both sets the void metadata columns and writes the audit entry. No further service-layer changes required for AC3.

**AC4: AR refund out of scope for Epic 57**
**Given** an AR payment
**When** AR refund functionality is required
**Then** the feature is deferred beyond Epic 57 — `POST /sales/payments/{id}/refund` is not in scope
**And** note: AR refund requires treasury handoff verification and is tracked as post-epic follow-up

**AC5: Immutability — POSTED invoice mutation rejected by application**
**Given** a POSTED AR invoice
**When** PATCH `/sales/invoices/{id}` attempts to modify amount or lines
**Then** response is `409 Conflict` with message indicating invoice is finalized
**And** the application rejects the update before it reaches the snapshot layer

**AC6: Immutability — POSTED payment mutation rejected**
**Given** a POSTED AR payment
**When** PATCH `/sales/payments/{id}` attempts to modify amount or allocation
**Then** response is `409 Conflict`

**AC7: Refund amount ≤ original payment amount**
**Given** a POSTED AR payment of $500
**When** refund of $600 is requested
**Then** response is `400 Bad Request` with error indicating refund exceeds payment amount

**AC8: Credit note requires POSTED invoice**
**Given** a DRAFT AR invoice
**When** credit note is attempted
**Then** response is `400 Bad Request` with error indicating invoice not finalized

**AC9: Void of already-voided invoice rejected**
**Given** an already-voided AR invoice
**When** void is attempted again
**Then** response is `409 Conflict` with error indicating invoice already voided

**AC10: Audit trail complete for all correction types**
**Given** each correction type (credit note, void)
**When** the correction is executed
**Then** `audit_logs` has corresponding entry with entity_type=`sales_invoice` and action in {`CREDIT_NOTE`, `VOID`}
**And** each entry references the original document ID

**AC11: Code review GO required**

---

## Test Coverage Criteria

- [ ] Coverage target: all credit/void/refund paths
- [ ] Happy paths to test:
  - [ ] Credit note creates new journal entries
  - [ ] Void marks original + audit trail
  - [ ] Refund creates reversal journal entries
  - [ ] Idempotency on credit note
- [ ] Error paths to test:
  - [ ] 409: POSTED invoice mutation attempt (trigger 0201)
  - [ ] 409: POSTED payment mutation attempt
  - [ ] 400: refund amount > original payment
  - [ ] 409: credit note on non-POSTED invoice
  - [ ] 409: void of already-voided invoice

---

## Test Fixtures

### Pre-Implementation Checklist
- [ ] New patterns identified: AR customer with paid invoice (for refund), partial payment balance (for partial credit)
- [ ] Existing canonical fixtures reviewed: AR customer fixture from Story 57.2
- [ ] Fixture location: `packages/modules-sales/src/test-fixtures/`

### Fixture Creation/Update
- [ ] **New fixtures needed:**
  - [ ] Pattern: AR invoice in POSTED status with journal entries (for void/refund)
  - [ ] Pattern: AR payment in POSTED status with journal entries (for refund)
  - [ ] Pattern: AR customer with partial payment balance (for partial credit note)

---

## Tasks / Subtasks

- [ ] Run migration `0203_sales_invoices_voided_at_by.sql` to add `voided_at`/`voided_by` columns to `sales_invoices` table (required for AC3)
- [ ] Verify `audit_logs` write for credit note events (AC10) — confirm `createCreditNote()` writes to `audit_logs` (if not, add it)
- [ ] Create AR invoice in POSTED status fixture (for void tests)
- [ ] Create AR payment in POSTED status fixture (for refund tests)
- [ ] Write integration tests for AC1–AC10 (real DB required — journal balance, immutability, audit)
- [ ] Verify trigger 0201 blocks non-archive UPDATE on AR snapshot
- [ ] Run `npm run lint -w @jurnapod/api` and `npm run typecheck -w @jurnapod/api`
- [ ] Code review with no P0/P1 blockers

---

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/sales/src/test-fixtures/ar-credit-void-fixtures.ts` | AR invoice/payment in POSTED status for correction tests |
| `apps/api/__test__/integration/sales/ar-credit-void-refund.test.ts` | Credit note, void, refund integration tests |

**Note:** `POST /sales/invoices/{id}/void` route is implemented in `apps/api/src/routes/sales/invoices.ts`. The remaining gap is the audit trail write in `voidInvoice()` service — see Tasks/Subtasks above.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/sales/src/index.ts` | Export | Add AR credit/void fixtures |

---

## Estimated Effort

1 day

## Risk Level

High (P1 — immutability violations would break audit trail and ledger correctness)

## Dev Notes

- **Trigger 0201 interaction:** Any non-archive UPDATE on `ap_reconciliation_snapshots` (including AR invoice snapshot rows) is blocked. The application must translate `SQLSTATE '45000'` to `409 Conflict`.
- **Journal immutability:** Original journal entries from invoice/payment are NEVER deleted or modified. Corrections create new entries.
- **Refund cap:** Refund amount MUST be ≤ original payment amount. Enforce in service layer.
- **Void is annotation:** When an invoice is voided, the original journal entries remain. The void is recorded in the audit trail only.
- **Credit note vs. debit note:** Credit note reduces the customer's balance. Debit note (rare) increases it. The journal direction is determined by the credit/debit flag.

## Cross-Cutting Concerns

### Audit Integration
- [x] Audit events required: credit note created, invoice voided, payment refunded
- [x] Audit fields: `company_id`, `user_id`, `reference_id`, `action_type`, `change_summary`
- [x] Audit tier: `MASTER` (financial corrections)

### Idempotency
- [x] Idempotency key: `client_ref` on credit note (refund uses payment_id as natural idempotency key)

### Validation Rules
- [x] Original invoice/payment must be POSTED before correction
- [x] Refund amount ≤ original payment amount
- [x] Credit note amount ≤ original invoice outstanding balance

## Validation Evidence

```bash
# Run AR credit/void/refund tests
npm run test:single -- "apps/api/__test__/integration/sales/ar-credit-void-refund.test.ts" -w @jurnapod/api

# Verify lint and typecheck
npm run lint:migrations && npm run lint -w @jurnapod/api && npm run typecheck -w @jurnapod/api
```

---

## Dependencies

- Story 57.1 complete (trigger 0201 verified)
- Story 57.2 complete (AR invoice + payment posting correct)
- AR customer with POSTED invoice fixture
- AR payment fixture

---

## Technical Debt Review

- [ ] No shortcuts taken
- [ ] No `TODO`/`FIXME` comments left
- [ ] Integration tests for all AC paths
- [ ] All new debt items added to registry

---

_Last Updated: 2026-05-05_