# Story 54.3: AP State Machine Integrity

> **HARD GATE (E54-A2):** Implementation of this story MUST NOT begin until the E54-A2 second-pass review checklist is included below.

**Status:** done — ✅ code review GO 2026-05-03

---

## Review Findings

### Batch-Applied Patches (Review Phase)
| # | Finding | Fix |
|---|---------|-----|
| 1 | **P0 — TOCTOU race**: `received_qty` read without `FOR UPDATE` allowed concurrent over-invoicing | Moved GRN validation inside posting transaction with `FOR UPDATE` |
| 2 | **P1 — Supplier mismatch**: `po_line_id` not validated against PO header's supplier | Added `INNER JOIN purchase_orders` + `supplier_id` check |
| 3 | **P2 — N+1 query**: Individual SELECT per invoice line | Batch-fetch all referenced PO lines in single query (`WHERE id IN (...)`) |
| 4 | **P3 — Error class name mismatch**: `PIGrnQtyExceededError` vs `GRN_INSUFFICIENT_QTY` | Renamed to `PIGrnInsufficientQtyError` |
| 5 | **P3 — Error message lacks line ID** | Added `po_line_id` to error message |
| 6 | **P3 — Duplicate `po_line_id` in same PI** | Added `Set` guard against duplicate PO line references |
| 7 | **P3 — Re-export gap**: Error not exported from adapter | Added `PIGrnInsufficientQtyError` to adapter re-exports |

### Deferred to Story 54.6
| Item | Rationale |
|------|-----------|
| **No `invoiced_qty` tracking**: sequential over-invoicing possible across multiple PIs | Requires new column + atomic increment — beyond Story 54.3 scope |

### Dismissed
| Item | Rationale |
|------|-----------|
| `String()` wrapping on DECIMAL value unstable | Kysely returns DECIMAL as string — `String()` is a no-op |
| Route mapping deviation from spec plan | Catch-all `PIError` handler already covers it automatically |
| Adapter type annotation beyond spec scope | Harmless additive change |


---

## Story Context

**Epic:** Epic 54 — AP Lifecycle Correctness
**Owner:** @bmad-dev
**Type:** Correctness risk resolution (test + limited production fix for AC3)
**Module:** `modules-purchasing`
**Sprint:** 54

---

## Problem Statement

The AP lifecycle (PO → GRN → Invoice → Payment) has implicit state transitions. Invalid transitions (e.g., VOIDED → POSTED) or bypass paths can corrupt workflow integrity. This story documents the state machine, proves invalid transitions are rejected, and enforces GRN-to-Invoice linkage.

**Pre-condition survey completed:** 2026-05-03
- `voidAPPayment()` exists at `ap-payment-service.ts:853` — `POSTED → VOID` only
- `voidPI()` exists at `purchase-invoice-service.ts:853` — `POSTED → VOID` only
- Three-way matching flag does NOT exist — **AC5 deferred to Story 54.6**
- GRN qty enforcement does NOT exist — **AC3 requires production fix**

---

## E54-A2: Second-Pass Determinism Review (MANDATORY)

**When required:** Invalid state transitions can create unpostable or unvoidable records. Second-pass review is **MANDATORY**.

**Second-pass checklist:**
- [ ] All valid state transitions documented
- [ ] Invalid transitions are rejected with clear errors
- [ ] GRN-to-Invoice linkage enforced (quantity comparison)
- [ ] Payment-to-Invoice linkage enforced
- [x] AC5 deferred to Story 54.6 (three-way matching feature absent)
- [ ] No `Date.now()` or `Math.random()` introduced during fix
- [ ] 3× consecutive green evidence
- [ ] No post-review fixes expected after second-pass sign-off

---

## Pre-Condition Survey Findings

### Payment Void State (AC2 — testable)
`voidAPPayment()` at `ap-payment-service.ts:853`. Enforces: `POSTED → VOID` only. `postAPPayment` requires `status === DRAFT` (line 622). **VOIDED→POSTED rejection is testable today.**

### GRN Qty Enforcement (AC3 — discovery / production fix required)
**P0 gap:** `postPI` does NOT validate GRN linkage:
- Line query (line 610-613) does NOT select `po_line_id`
- `createDraftPI` does NOT populate `po_line_id` during invoice line creation
- `received_qty` is tracked on PO lines (updated by GRN service), but `postPI` never compares invoice line qty against it
- **No quantity comparison against GRN occurs at any point during invoice create or post**

AC3 is a **discovery test** (write first, fix production if it fails).

### Three-Way Matching (AC5 — deferred)
No `three_way_matching` setting, flag, or enforcement exists anywhere in the codebase. AC5 is **deferred to Story 54.6** as a discovered architectural gap.

---

## Acceptance Criteria

**AC1:** All valid state transitions documented
- **Given** the AP document types (PO, GRN, Invoice, Payment)
- **When** the state machine is documented
- **Then** valid transitions are:
  - PO: `DRAFT → SENT → (PARTIAL_RECEIVED | RECEIVED) → CLOSED`
  - Invoice: `DRAFT → POSTED → VOID`
  - Payment: `DRAFT → POSTED → VOID`

**AC2:** Invalid transitions are rejected
- **Given** a payment in VOIDED status
- **When** `postAPPayment` is called
- **Then** the request returns 400 with error `INVALID_STATUS_TRANSITION`
- **Given** a payment in DRAFT status
- **When** `voidAPPayment` is called
- **Then** the request returns 400 with error `INVALID_STATUS_TRANSITION`
- **Given** an invoice in VOIDED status
- **When** `postPI` is called
- **Then** the request returns 400 with error `INVALID_STATUS_TRANSITION`
- **Given** an invoice in DRAFT status
- **When** `voidPI` is called
- **Then** the request returns 400 with error `INVALID_STATUS_TRANSITION`

**AC3 (DISCOVERY — write first):** GRN-to-Invoice linkage enforced
- **Write first** (same pattern as 54.2 AC1b — P0 discovery test)
- **Expected result:** FAIL — `postPI` does not validate GRN quantities
- **If fails:** expand scope to fix production code:
  1. `createDraftPI` accepts optional `po_line_id` per invoice line, stores it in `purchase_invoice_lines.po_line_id`
  2. `postPI` validates each line with non-null `po_line_id` against PO line's `received_qty`
  3. If `received_qty < line.qty`, return 400 with error `GRN_INSUFFICIENT_QTY`
  4. Lines with null `po_line_id` are allowed (backward compatibility)
- **Given** a PO line with `received_qty = 10`, a GRN exists for that PO
- **When** an invoice line references that PO line with `qty = 15`
- **Then** the request is rejected with 400 `GRN_INSUFFICIENT_QTY`

**AC4:** Payment-to-Invoice linkage enforced
- **Given** a payment allocation referencing invoice ID 999999 (non-existent)
- **When** `postAPPayment` is called
- **Then** the request returns 404 with error `INVOICE_NOT_FOUND`

**AC5:** ~~No bypass path to post without GRN~~ → **DEFERRED to Story 54.6**
- Three-way matching feature does not exist in the codebase
- AC5 moved to Story 54.6 defect log as discovered architectural gap

**AC6:** Integration tests written and 3× consecutive green

**AC7:** Code review GO required

---

## Implementation Plan

### Execution Order
1. **Write AC3 discovery test FIRST** — same pattern as 54.2 AC1b
   - If it passes → continue (GRN linkage already enforced by some other path)
   - If it fails (expected) → fix production, then continue
2. Write AC2 + AC4 (test-only, no production changes)
3. Write AC1 as code documentation comments in test file
4. Run full suite 3× (AC6)
5. Submit for code review (AC7)

### Production Fixes (only if AC3 fails)
| File | Change |
|------|--------|
| `purchase-invoice-service.ts` — `createDraftPI` | Accept optional `po_line_id` per invoice line, persist to `purchase_invoice_lines.po_line_id` |
| `purchase-invoice-service.ts` — `postPI` | Add validation: for each line with non-null `po_line_id`, query `purchase_order_lines.received_qty`. If `received_qty < line.qty`, throw `GRN_INSUFFICIENT_QTY` |
| `apps/api/src/routes/purchasing/purchase-invoices.ts` | Map `GRN_INSUFFICIENT_QTY` to HTTP 400 |

### Fixture Strategy
**Full Fixture Mode** — use HTTP API for all setup (consistent with existing `goods-receipts.test.ts` and `ap-payments.test.ts`):
1. `createTestCompanyMinimal()` → companyId
2. `createTestUser(companyId)` → user
3. `getRoleIdByCode('OWNER')` → roleId; `assignUserGlobalRole(userId, roleId)`
4. `setModulePermission(companyId, roleId, 'purchasing', 63)`
5. `setModulePermission(companyId, roleId, 'accounting', 63)`
6. `createTestSupplier(companyId)` → supplierId
7. `createTestPurchasingAccounts(companyId)` → {ap_account_id, expense_account_id}
8. `createTestBankAccount(companyId)` → bankAccountId
9. `loginForTest(baseUrl, ...)` → ownerToken

**PO + GRN setup for AC3:**
1. Create PO via `POST /api/purchasing/orders` with line items
2. Post PO via `POST /api/purchasing/orders/:id/post`
3. Create GRN via `POST /api/purchasing/receipts` referencing PO line + qty ≤ PO line qty
4. Post GRN via `POST /api/purchasing/receipts/:id/post`
5. Create invoice via `POST /api/purchasing/invoices` referencing PO line

**GRN creation patterns** (from `goods-receipts.test.ts` lines 261-300):
```typescript
POST /api/purchasing/receipts
{
  supplier_id,
  reference_number: makeTag('GRCR', ++counter),
  receipt_date: '2026-04-19',
  lines: [{ po_line_id: poLineId, qty: '6', unit: 'pcs' }]
}
```

### Key Constants
```typescript
// From @jurnapod/shared
PURCHASE_INVOICE_STATUS = { DRAFT: 1, POSTED: 2, VOID: 3 }
AP_PAYMENT_STATUS = { DRAFT: 10, POSTED: 40, VOID: 50 }

// PO status (from purchase-orders.test.ts)
DRAFT, SENT, PARTIAL_RECEIVED, RECEIVED, CLOSED
```

### Test File
`apps/api/__test__/integration/purchasing/ap-state-machine.test.ts`

### No-Go Criteria
- AC3 discovery test fails AND the minimum production fix cannot be completed within this story's effort estimate (2 days) → escalate to Epic 54 decision (defer to 54.6)

---

## Test Coverage Criteria

- [ ] Happy paths:
  - [ ] Valid Invoice transition: DRAFT → POSTED → VOID
  - [ ] Valid Payment transition: DRAFT → POSTED → VOID
- [ ] Error paths (invalid transitions):
  - [ ] 400: VOIDED → POSTED (payment)
  - [ ] 400: DRAFT → VOID (payment)
  - [ ] 400: VOIDED → POSTED (invoice)
  - [ ] 400: DRAFT → VOID (invoice)
  - [ ] 400: GRN_INSUFFICIENT_QTY — invoice line qty > received_qty
  - [ ] 404: INVOICE_NOT_FOUND — payment to non-existent invoice
- [ ] AC5 deferred to Story 54.6 (three-way matching feature absent)

---

## Defect Log

| ID | Source | Description | Status |
|----|--------|-------------|--------|
| D54-003 | 54.3 | Three-way matching flag does not exist — AC5 cannot be tested | **deferred → 54.6** |
| D54-004 | 54.3 | `postPI` does not validate GRN quantities — AC3 requires production fix | **open** (in-scope fix) |

---

## Risk Register

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R54-003a | AP state machine has invalid bypass path | P1 | AC2 eliminates DRAFT→VOID and VOIDED→POSTED bypasses |
| R54-003b | Invoice posted without GRN linkage | P1 | AC3 discovery test — fix production if test fails |
| R54-003c | AC3 fix exceeds effort estimate | P2 | Define minimum viable fix; defer extra validation to 54.6 |

---

## Dependencies

- Stories 54.1 and 54.2 (invoice + payment correctness) — ✅ both done
- Epic 46 (GRN service, PO state machine) — ✅ done

---

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/__test__/integration/purchasing/ap-state-machine.test.ts` | Create | State machine integrity tests — 1 file |

### Production Files (conditional — only if AC3 fails)

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/purchasing/src/services/purchase-invoice-service.ts` | Modify | Accept and validate `po_line_id` on invoice lines |
| `apps/api/src/routes/purchasing/purchase-invoices.ts` | Modify | Map `GRN_INSUFFICIENT_QTY` to HTTP 400 |

---

## Estimated Effort

2 days (1 day test-only ACs + AC3 discovery/fix; 1 day review prep)

---

## Validation Evidence

```bash
# Run AP state machine tests
npm run test:single -w @jurnapod/api -- "__test__/integration/purchasing/ap-state-machine.test.ts"

# Expected: AC2 + AC4 pass immediately; AC3 either passes (unlikely) or triggers production fix
# Full suite: 3× consecutive green after all fixes
```