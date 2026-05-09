# Story 61.1: Sales Invoice Lifecycle Correctness

**Status:** ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 61 --story 61-1 --status done --title sales-invoice-lifecycle-correctness`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **financial auditor**,  
I want **sales invoice lifecycle transitions (DRAFT→POSTED→VOID) to be state-machine-valid and immutable**,  
So that **posted invoices cannot be silently mutated and financial records are trustworthy**.

## Context

- Source: Epic 61 (FR1, FR5) — Sales & Purchasing Lifecycle Correctness
- Depends on: Epic 60 close gates confirmed (E60-G1, E60-G2, E60-G3)
- Scope: `apps/api/src/routes/sales/invoices.ts`, `@jurnapod/modules-sales`, `@jurnapod/modules-accounting`
- Risk: P0 — silent mutation of posted invoices corrupts financial records
- Predecessor: Epic 57 (AR + Treasury Correctness) established void/refund invariants; Epic 60 (ACL) established DELETE permission for void operations

### Lifecycle State Machine

```
DRAFT ──[post]──► POSTED ──[void]──► VOID
  │                   │
  └──[mutate]──✔      └──[mutate]──✖ (immutable)
```

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** DRAFT→POSTED transition succeeds with journal entries; POSTED→VOID creates reversal journals
- [x] **Error paths identified:** POSTED invoice rejects field mutation; DRAFT invoice rejects void; duplicate post/void rejected
- [x] **Edge cases identified:** Invoice with payments cannot be voided; concurrent post attempts; already-voided invoice operations
- [x] **Test fixture needs identified:** Seeded invoice at each lifecycle state (DRAFT, POSTED, VOID)
- [x] **Integration test scope defined:** Real DB tests with lifecycle state transitions and immutability guards
- [x] **Negative auth test role selected:** CASHIER (mask=0 for void/update on sales.invoices)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| DRAFT→POSTED with journal creation | Happy | Integration |
| POSTED→VOID with reversal journals | Happy | Integration |
| POSTED invoice rejects field mutation | Error | Integration |
| DRAFT invoice rejects void | Error | Integration |
| Duplicate post on POSTED invoice | Error | Integration |
| CASHIER cannot void invoice | Error | Integration |
| Invoice with payments rejects void | Edge | Integration |
| Concurrent post attempts | Edge | Integration |

**Sign-off:** Test scenarios reviewed before implementation.

---

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

### Error Boundary Test Matrix

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|-------------|----------------|------------------|------------------|---------------------|
| `InvoiceNotFoundError` | `@jurnapod/modules-sales` | `apps/api` | ✅ | ✅ |
| `InvoiceAlreadyPostedError` | `@jurnapod/modules-sales` | `apps/api` | ✅ | ✅ |
| `InvoiceAlreadyVoidedError` | `@jurnapod/modules-sales` | `apps/api` | ✅ | ✅ |
| `InvoiceHasPaymentsError` | `@jurnapod/modules-sales` | `apps/api` | ✅ | ✅ |
| `PostingError` | `@jurnapod/modules-accounting` | `apps/api` | ✅ | ✅ |

---

## Cross-Module Decision Gate (MANDATORY — E54-A1 Follow-Up)

### Decision Record

| # | Decision | Modules Affected | Rationale | Winston Sign-Off |
|---|----------|-----------------|-----------|-----------------|
| 1 | Invoice immutability guard in app code (not DB trigger — AGENTS.md §C) | sales | Enforceable, testable, reviewable | `2026-05-09 ✓` |
| 2 | POSTED→VOID uses DELETE permission (Epic 60 ACL convention) | sales, auth | DELETE=8 for void/cancel as financial soft-delete | `2026-05-09 ✓` |
| 3 | Journal reversal on void creates balanced debits/credits | sales, accounting | Reversal must maintain GL integrity | `2026-05-09 ✓` |

---

## Acceptance Criteria

**AC1: DRAFT→POSTED transition creates journal entries**
**Given** an invoice in DRAFT status with valid line items,
**When** the invoice is posted via `POST /sales/invoices/:id/post`,
**Then** the invoice status transitions to POSTED,
**And** journal entries are created for revenue and AR (balanced),
**And** `posted_at` is set to current timestamp.

**AC2: POSTED invoices reject field mutation**
**Given** an invoice in POSTED status,
**When** any PATCH/PUT request attempts to modify invoice fields,
**Then** the request is rejected with 409 CONFLICT,
**And** the invoice remains unchanged.

**AC3: POSTED→VOID creates reversal journals**
**Given** an invoice in POSTED status with no payments applied,
**When** the invoice is voided via `POST /sales/invoices/:id/void`,
**Then** the invoice status transitions to VOID,
**And** reversal journal entries are created (debiting AR, crediting revenue),
**And** `voided_at` and `voided_by` are recorded.

**AC4: Invoice with payments rejects void**
**Given** an invoice in POSTED status with payments applied,
**When** void is attempted via `POST /sales/invoices/:id/void`,
**Then** the request is rejected with 409 CONFLICT,
**And** the error message indicates payments must be reversed first.

**AC5: DRAFT invoice rejects void**
**Given** an invoice in DRAFT status,
**When** void is attempted,
**Then** the request is rejected (DRAFT invoices are deleted, not voided).

**AC6: Void uses DELETE permission**
**Given** a user with sales.invoices READ but NOT DELETE permission,
**When** void is attempted via `POST /sales/invoices/:id/void`,
**Then** the request is rejected with 403 FORBIDDEN.

**AC7: Lifecycle audit trail**
**Given** an invoice that transitions DRAFT→POSTED→VOID,
**When** the invoice history is queried,
**Then** each transition is recorded with timestamp, user, and action.

---

## Tasks / Subtasks

- [ ] Task 1: Audit existing invoice lifecycle code (AC: all)
  - [ ] 1.1 Review `apps/api/src/routes/sales/invoices.ts` lifecycle handlers
  - [ ] 1.2 Review `@jurnapod/modules-sales` invoice service
  - [ ] 1.3 Identify gaps in state-machine validation
- [ ] Task 2: Implement lifecycle state-machine guards (AC: 1,2,3,4,5)
  - [ ] 2.1 Add `ensurePostable()` guard — only DRAFT invoices can be posted
  - [ ] 2.2 Add `ensureVoidable()` guard — only POSTED invoices without payments can be voided
  - [ ] 2.3 Add immutability check — POSTED invoices reject PATCH/PUT
  - [ ] 2.4 Ensure void uses DELETE permission (AC: 6)
- [ ] Task 3: Verify journal reconciliation (AC: 1,3)
  - [ ] 3.1 Confirm POST creates balanced journal entries (revenue + AR)
  - [ ] 3.2 Confirm VOID creates balanced reversal entries
  - [ ] 3.3 Audit trail: each transition logged with user/timestamp (AC: 7)
- [ ] Task 4: Integration tests (AC: all)
  - [ ] 4.1 DRAFT→POSTED happy path with journal verification
  - [ ] 4.2 POSTED→VOID happy path with reversal journal verification
  - [ ] 4.3 POSTED invoice immutability (reject PATCH)
  - [ ] 4.4 Invoice with payments rejects void (409)
  - [ ] 4.5 DRAFT invoice rejects void
  - [ ] 4.6 Duplicate post on POSTED invoice (409)
  - [ ] 4.7 CASHIER cannot void invoice (403, DELETE permission)
  - [ ] 4.8 Concurrent post attempts (idempotency)

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/sales/invoices.ts` | Modify | Add lifecycle state-machine guards, immutability checks |
| `packages/modules/sales/src/` | Audit | Verify invoice service lifecycle logic |
| `apps/api/__test__/integration/sales/` | Create | Invoice lifecycle integration tests |

## Dev Notes

- Existing invoice route at `apps/api/src/routes/sales/invoices.ts` already has `POST /:id/post` and `POST /:id/void` handlers
- Posting creates journal entries via `invoiceService.postInvoice()` — verify balance
- Void handler was recently fixed to use `permission: "delete"` (Epic 60 post-close ACL fix)
- Lifecycle guards MUST be in application code, NOT database triggers (AGENTS.md §C)
- Use `instanceof` checks for domain errors; include `error.name` fallback per E58-A1
- Invoice status values: `DRAFT`, `POSTED`, `VOID` — verify against `invoice_statuses` table

## Validation Evidence

```bash
npx vitest run __test__/integration/sales/invoice-lifecycle.test.ts
# Expected: all tests pass, AC1-AC7 verified
```

## Dependencies

- Epic 60 ACL hardening (DELETE permission for void operations)
- Epic 57 AR correctness (void/refund invariants)
- `@jurnapod/modules-sales` invoice service
- `@jurnapod/modules-accounting` journal posting

## Risk Level

P0 — Silent mutation of posted invoices is a blocker for financial integrity
