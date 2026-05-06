# Story 57.3: AR Credits/Void/Refund Invariants

**Status:** ready-for-dev

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

## Pre-Implementation State (Resolved Gaps)

The following gaps from the original story spec have been resolved:

| Gap | Resolution | Status |
|-----|------------|--------|
| `POST /sales/invoices/{id}/void` route missing | Route implemented at `apps/api/src/routes/sales/invoices.ts:529-591` | ✅ Done |
| `voided_at`/`voided_by` columns missing | Migration `0203_sales_invoices_voided_at_by.sql` ran; `sales-db.ts:576-596` sets both columns | ✅ Done |
| `audit_logs` write for VOID missing | `sales-db.ts:586-595` writes `audit_logs` with `action='VOID'` inside `updateInvoiceStatus` VOID branch | ✅ Done |
| `audit_logs` write for CREDIT_NOTE missing | `credit-note-service.ts:254` calls `insertAuditLog` with `action='CREDIT_NOTE'` | ✅ Done |

**Scope now focuses on remaining gaps:** credit note journal posting (AC1) and integration test coverage.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** Credit note creation (new entries + journal posting), void (audit trail), refund deferred to post-57
- [x] **Error paths identified:** Mutation of POSTED invoice (409), mutation of POSTED payment (409), credit note on already-voided invoice, void of already-voided invoice
- [x] **Edge cases identified:** Partial credit, duplicate client_ref on credit note, idempotent re-void
- [x] **Test fixture needs identified:** POSTED AR invoice with journal batch (for void), AR payment (for refund deferral)
- [x] **Integration test scope defined:** Real DB required (journal entries, audit trail, immutability enforcement)
- [x] **Negative auth test role selected:** `CASHIER` (lowest sales permissions; appropriate for correction flows)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| AR credit note creates journal entries atomically | Happy | Integration |
| AR credit note idempotency (duplicate client_ref) | Happy | Integration |
| AR void marks original as voided — no ledger amounts changed | Happy | Integration |
| AR refund — out of scope for Epic 57 | Error | N/A (404 returned) |
| Credit note on non-POSTED invoice → 400 | Error | Integration |
| Void on already-voided invoice → 409 | Error | Edge |
| POSTED invoice PATCH → 409 | Error | Integration |
| POSTED payment PATCH → 409 | Error | Integration |
| Audit trail entry recorded for credit note and void | Happy | Integration |
| Code review GO | Happy | Manual |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

### Pre-Implementation Checklist

- [x] **Modules touched:** `modules-sales` (credit/void/refund), `modules-accounting` (journal), `modules-platform` (company/customer), `packages/db` (trigger)
- [x] **Cross-module decisions identified:**
  1. Credit note uses same `receivable_account_id` as original invoice (customer's receivable)
  2. Refund amount capped at original payment amount (no over-refund) — deferred beyond Epic 57
  3. Void records actor + timestamp on `sales_invoice.voided_at`/`voided_by`; `audit_logs` entry for entity_type=`sales_invoice`, action=`VOID`
  4. All corrections require POSTED invoice/payment (not DRAFT)
- [x] **Winston sign-off obtained:** Resolved — same pattern proven in Epics 55/56
- [x] **Decisions recorded:** Per table below

### Decision Record

| # | Decision | Modules Affected | Rationale | Alternatives Considered | Status |
|---|----------|-----------------|-----------|------------------------|--------|
| 1 | Credit note uses original invoice's customer `receivable_account_id` | sales, accounting | Customer receivable account is the counterparty; credit note reduces AR balance | Separate credit note receivable account (inconsistent) | ✅ Resolved |
| 2 | Refund amount ≤ original payment amount (no over-refund) | sales, treasury | Over-refund would cause AR subledger to go negative beyond payment; deferred beyond Epic 57 | Allow over-refund (risks AR balance integrity) | Deferred |
| 3 | Void records actor + timestamp on invoice record; audit_log entry for entity_type=`sales_invoice`, action=`VOID` | accounting, sales | Immutable ledger principle — void is annotation, not reversal; actor tracking is required | Reversal journal entries (changes ledger totals) | ✅ Resolved |
| 4 | All corrections require POSTED status (not DRAFT) | sales | Corrections apply to finalized financial records | Allow corrections on DRAFT (risks incomplete records) | ✅ Resolved |
| 5 | Credit note posting is journal-atomic via CreditNotePostingHook (same pattern as invoice/payment hooks) | sales, accounting | Ensures status transition + GL posting happen in one transaction; no partial POSTED state | Separate status update + async journal (risk of inconsistency) | ✅ Resolved |

---

## Acceptance Criteria

**AC1: AR credit note creates new journal entries atomically**
**Given** a POSTED AR invoice with outstanding balance
**When** POST `/sales/credit-notes` is called with `type='ar_credit_note'` and credit line items
**Then** new journal entries are created atomically within the credit note transaction: credit to customer's `receivable_account_id`, debit to credit note revenue/expense account
**And** original invoice journal entries remain unchanged (immutable ledger)
**And** `audit_logs` receives entry for the credit note event (entity_type=`sales_invoice`, action=`CREDIT_NOTE`)

> **Implementation note:** Requires `CreditNotePostingHook` injected into `postCreditNote()` inside `credit-note-service.ts` transaction, following the same pattern as `InvoicePostingHook` (Story 57.2) and `PaymentPostingHook`.

**AC2: AR credit note idempotency**
**Given** a duplicate POST to `/sales/credit-notes` with same `client_ref`
**When** the first request succeeded
**Then** the second request returns `201` with the existing credit note and no second journal entry
**And** `audit_logs` is not written a second time

> **Implementation note:** Current route returns 201 unconditionally. The idempotency is guaranteed by `createCreditNote` returning the existing record without throwing — no new journal entries are created on the replay path.

**AC3: AR void marks original as voided (no ledger change)**
**Given** a POSTED AR invoice
**When** POST `/sales/invoices/{id}/void` is called
**Then** invoice status is updated to `VOID`
**And** `invoice.voided_at` is set and `invoice.voided_by` records the actor
**And** `audit_logs` receives entry for the void event (entity_type=`sales_invoice`, action=`VOID`)
**And** original journal entries remain in ledger (unchanged amounts)

> **Implementation note:** Already fully implemented in `sales-db.ts:570-596` VOID branch of `updateInvoiceStatus`. No further implementation needed.

**AC4: AR refund out of scope for Epic 57**
**Given** an AR payment
**When** AR refund functionality is required
**Then** `POST /sales/payments/{id}/refund` returns `404 Not Found`
**And** the feature is deferred beyond Epic 57 pending treasury handoff verification

**AC5: Immutability — POSTED invoice mutation rejected by application**
**Given** a POSTED AR invoice
**When** PATCH `/sales/invoices/{id}` attempts to modify amount or lines
**Then** response is `409 Conflict` with message indicating invoice is finalized

> **Implementation note:** Route already maps `InvoiceStatusError` → 409. Story 57.2 added additional defensive message mapping for `DatabaseConflictError("Invoice is not editable")` → 409.

**AC6: Immutability — POSTED payment mutation rejected**
**Given** a POSTED AR payment
**When** PATCH `/sales/payments/{id}` attempts to modify amount or allocation
**Then** response is `409 Conflict`

> **Implementation note:** PATCH `/sales/payments/:id` route must add conflict error mapping for payment status transitions. Verify the route handles `DatabaseConflictError` from payment service.

**AC7: (Deferred — refund not in scope for Epic 57)**
Refund amount cap validation is deferred to post-Epic 57 treasury handoff work.

**AC8: Credit note requires POSTED invoice**
**Given** a DRAFT AR invoice
**When** credit note is attempted
**Then** response is `400 Bad Request` with error indicating invoice not finalized

> **Implementation note:** Already enforced in `createCreditNote` — throws `DatabaseReferenceError("Invoice not found or not posted")` → route maps to 404. Should be documented as 400 in test expectation (route-level message may differ from service message).

**AC9: Void of already-voided invoice rejected**
**Given** an already-voided AR invoice
**When** void is attempted again
**Then** response is `409 Conflict` with error indicating invoice already voided

> **Implementation note:** Already implemented — `voidInvoice` throws `DatabaseConflictError("Invoice is already voided")` → route maps to 409.

**AC10: Audit trail complete for all correction types**
**Given** each correction type (credit note, void)
**When** the correction is executed
**Then** `audit_logs` has corresponding entry with entity_type=`sales_invoice` and action in {`CREDIT_NOTE`, `VOID`}
**And** each entry references the original document ID

**AC11: Code review GO required**

---

## Test Coverage Criteria

- [ ] Coverage target: all credit/void paths (refund deferred)
- [ ] Happy paths to test:
  - [ ] Credit note creates new journal entries atomically
  - [ ] Void marks original + audit trail
  - [ ] Idempotency on credit note duplicate POST
- [ ] Error paths to test:
  - [ ] 409: POSTED invoice mutation attempt
  - [ ] 409: POSTED payment mutation attempt
  - [ ] 400: credit note on non-POSTED invoice
  - [ ] 409: void of already-voided invoice
  - [ ] 404: refund endpoint returns not found (deferred)

---

## Test Fixtures

### Pre-Implementation Checklist
- [ ] New patterns identified: POSTED AR invoice with journal batch (for void + credit note tests)
- [ ] Existing canonical fixtures reviewed: AR customer fixture from Story 57.2 (`createTestCustomerForCompany`), fiscal year fixtures
- [ ] Fixture location: `packages/modules-sales/src/test-fixtures/`

### Fixture Creation/Update
- [ ] **New fixtures needed:**
  - [ ] Pattern: AR invoice in POSTED status with journal batch (for void and credit note tests) — created via canonical `POST /sales/invoices` flow
  - [ ] Pattern: credit note idempotency via `client_ref` duplication

---

## Tasks / Subtasks

- [x] ~~Run migration `0203_sales_invoices_voided_at_by.sql`~~ — already applied, columns exist
- [x] ~~Verify `audit_logs` write for credit note events~~ — confirmed in `credit-note-service.ts:254`
- [ ] Add `CreditNotePostingHook` interface to `packages/modules/sales/src/interfaces/`
- [ ] Inject `postingHook` into `CreditNoteServiceDeps` in `credit-note-service.ts`
- [ ] Call `postingHook.postCreditNoteToJournal()` inside `postCreditNote()` transaction
- [ ] Create `ApiCreditNotePostingHook` adapter in `apps/api/src/lib/modules-sales/`
- [ ] Create `credit-note-service-composition.ts` wiring `db + accessScopeChecker + ApiCreditNotePostingHook`
- [ ] Export new hook + composition from `apps/api/src/lib/modules-sales/index.ts`
- [ ] Switch `POST /sales/credit-notes/:id/post` route to use composed service
- [ ] Verify PATCH `/sales/payments/:id` route maps `DatabaseConflictError` → 409 (for POSTED payment immutability)
- [ ] Write integration tests for AC1–AC10 (replace all `it.skip()` in `ar-credit-void-refund.test.ts`)
- [ ] Run `npm run lint -w @jurnapod/api` and `npm run typecheck -w @jurnapod/api`
- [ ] Code review with no P0/P1 blockers

---

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/sales/src/interfaces/credit-note-posting-hook.ts` | `CreditNotePostingHook` interface (analogous to `InvoicePostingHook`) |
| `apps/api/src/lib/modules-sales/credit-note-posting-hook.ts` | API adapter implementing `CreditNotePostingHook` using `postCreditNoteToJournal` |
| `apps/api/src/lib/modules-sales/credit-note-service-composition.ts` | Singleton factory wiring credit note service with posting hook |
| `apps/api/__test__/integration/sales/ar-credit-void-refund.test.ts` | Complete integration test suite replacing all `it.skip()` stubs |

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/sales/src/types/credit-note.ts` | Add `postCreditNoteInput` type for hook input |
| `packages/modules/sales/src/services/credit-note-service.ts` | Add `postingHook` to deps; call hook inside `postCreditNote()` transaction |
| `packages/modules/sales/src/index.ts` | Export `CreditNotePostingHook` interface and `postCreditNoteInput` type |
| `apps/api/src/lib/modules-sales/index.ts` | Export `ApiCreditNotePostingHook`, `createComposedCreditNoteService`, `getComposedCreditNoteService` |
| `apps/api/src/routes/sales/credit-notes.ts` | Switch to composed service; verify journal posting on credit note post |

---

## Estimated Effort

1 day

## Risk Level

High (P1 — immutability violations would break audit trail and ledger correctness)

## Dev Notes

- **Credit note journal posting pattern:** Use `CreditNotePostingHook` inside `postCreditNote()` transaction, same pattern as `InvoicePostingHook` in Story 57.2. The hook call must be inside the transaction so both status update and journal creation are atomic.
- **No new DB triggers:** All invariants enforced in application code. AGENTS.md §C prohibits new business-logic triggers.
- **Idempotency:** Credit note duplicate POST returns 201 with existing record (no second journal). The `createCreditNote` service returns existing record on duplicate `client_ref`.
- **Immutability:** POSTED invoices and payments cannot be PATCHed — route returns 409 via error mapping.
- **Void is annotation:** Void records audit trail only; original journal entries remain. No reversal journal is posted on void.
- **Refund deferred:** `POST /sales/payments/:id/refund` is not implemented; returns 404. AC7 (refund amount cap) is deferred to post-Epic 57 treasury handoff work.
- **Fixture mode:** Full Fixture — use canonical API routes for all fixture setup (POST invoices, POST credit notes). No decomposed SQL for setup.

---

## Cross-Cutting Concerns

### Audit Integration
- [x] Audit events required: credit note created (`CREDIT_NOTE`), invoice voided (`VOID`)
- [x] Audit fields: `company_id`, `user_id`, `action`, `entity_type`, `entity_id`, `payload_json`
- [x] Audit tier: `MASTER` (financial corrections)

### Idempotency
- [x] Idempotency key: `client_ref` on credit note (already implemented in `createCreditNote`)
- [x] Duplicate POST returns 201 with existing record (no second journal, no second audit entry)

### Validation Rules
- [x] Original invoice must be POSTED before credit note (enforced in service)
- [x] Credit note amount ≤ original invoice outstanding balance (capacity check in service)
- [x] POSTED payment PATCH → 409 (route-level error mapping)

---

## Validation Evidence

```bash
# Run AR credit/void/refund tests
npm run test:single -- "apps/api/__test__/integration/sales/ar-credit-void-refund.test.ts" -w @jurnapod/api

# Verify lint and typecheck
npm run lint:migrations && npm run lint -w @jurnapod/api && npm run typecheck -w @jurnapod/api

# Epic close gate
npx tsx scripts/validate-sprint-status.ts --epic 57
```

---

## Dependencies

- Story 57.1 complete (trigger 0201 verified)
- Story 57.2 complete (AR invoice + payment posting correct, atomic journal pattern established)
- Migration `0203_sales_invoices_voided_at_by.sql` applied
- `voidInvoice()` audit trail write confirmed
- `createCreditNote()` audit trail write confirmed

---

## Technical Debt Review

- [ ] No shortcuts taken
- [ ] No `TODO`/`FIXME` comments left
- [ ] Integration tests for all AC paths
- [ ] All new debt items added to registry

---

## Dev Agent Record

### Agent Model Used

MiniMax-M2.7 (minimax-coding-plan/MiniMax-M2.7)

### Debug Log References

- Story 57.2 implementation: `invoice-posting-hook.ts`, `invoice-service-composition.ts`, `invoice-service.ts` postInvoice hook wiring
- Credit note service: `packages/modules/sales/src/services/credit-note-service.ts`
- Sales posting adapter: `apps/api/src/lib/sales-posting.ts`

### Completion Notes List

*(To be filled during implementation)*

### File List

*(To be filled during implementation)*

---

_Last Updated: 2026-05-06_