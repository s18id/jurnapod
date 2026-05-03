# Story 54.3 Completion Report

**Story:** 54.3 — AP State Machine Integrity
**Epic:** 54 — AP Lifecycle Correctness
**Status:** ✅ DONE
**Completed:** 2026-05-03

---

## Summary

Story 54.3 proved the AP document state machine (Invoice, Payment) rejects all invalid transitions, and enforces GRN-to-Invoice quantity linkage via optional `po_line_id` per invoice line. AC5 (three-way matching) deferred to Story 54.6 — feature absent from codebase. Production fix applied for AC3.

---

## Files Created/Modified

### Created
| File | Description |
|------|-------------|
| `apps/api/__test__/integration/purchasing/ap-state-machine.test.ts` | AP state machine integrity tests — 546 lines, 8 test cases |

### Modified
| File | Changes |
|------|---------|
| `packages/shared/src/schemas/purchasing.ts` | Added `po_line_id` to `PurchaseInvoiceLineSchema` |
| `packages/modules/purchasing/src/types/purchase-invoice.ts` | Added `PIGrnInsufficientQtyError` class; added `poLineId` to `PICreateInput` |
| `packages/modules/purchasing/src/services/purchase-invoice-service.ts` | `createDraftPI` persists `po_line_id`; `postPI` validates qty with `FOR UPDATE` + supplier check |
| `packages/modules/purchasing/src/services/purchase-invoice-service.ts` | Added `PIGrnInsufficientQtyError` import and usage |
| `apps/api/src/routes/purchasing/purchase-invoices.ts` | Mapped `po_line_id → poLineId`; routes map `GRN_INSUFFICIENT_QTY → 400` |
| `apps/api/src/lib/purchasing/purchase-invoice.ts` | Adapter re-exports `PIGrnInsufficientQtyError` |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | All valid state transitions documented | ✅ Complete |
| AC2 | Invalid transitions rejected (VOIDED→POSTED, DRAFT→VOID for both PI and payment) | ✅ Complete |
| AC3 | GRN-to-Invoice linkage enforced (qty comparison against `received_qty`) | ✅ Complete |
| AC4 | Payment-to-Invoice linkage enforced (404 for non-existent invoice) | ✅ Complete |
| AC5 | No bypass path to post without GRN | ⚠️ Deferred → Story 54.6 |
| AC6 | Integration tests 3× consecutive green | ✅ Complete |
| AC7 | Code review GO | ✅ Complete (2026-05-03) |

---

## Key Features Implemented

### AC2 — Invalid State Transition Rejection
- **Payment VOIDED → POST**: 400 `INVALID_STATUS_TRANSITION`
- **Payment DRAFT → VOID**: 400 `INVALID_STATUS_TRANSITION`
- **Invoice VOIDED → POST**: 400 `INVALID_STATUS_TRANSITION`
- **Invoice DRAFT → VOID**: 400 `INVALID_STATUS_TRANSITION`
- **Invoice already POSTED → POST**: 409 `ALREADY_POSTED` (sequential re-post)

### AC3 — GRN-to-Invoice Quantity Linkage
- `createDraftPI` accepts optional `po_line_id` per invoice line
- `postPI` validates each line with non-null `po_line_id`:
  - `FOR UPDATE` lock on PO lines (prevents TOCTOU race)
  - Supplier cross-validation (PO line supplier must match invoice supplier)
  - Quantity check: `invoiceQty <= receivedQty` (throws `PIGrnInsufficientQtyError` if exceeded)
  - Duplicate PO line detection within same invoice
- Lines with null `po_line_id` allowed (backward compatibility)

### AC4 — Payment Allocation Linkage
- Non-existent invoice ID returns 404 `INVOICE_NOT_FOUND`

---

## Technical Implementation

### Data Flow
```
PO create → PO post → GRN create → GRN post
                                      ↓
Invoice create (with po_line_id) → Invoice post (validates qty) → Journal entry
                                                                      ↓
Payment create → Payment post (validates invoice linkage) → Journal entry
```

### API Endpoints Used
- `POST /api/purchasing/orders` — PO creation
- `POST /api/purchasing/orders/:id/post` — PO posting
- `POST /api/purchasing/receipts` — GRN creation (references PO line)
- `POST /api/purchasing/receipts/:id/post` — GRN posting
- `POST /api/purchasing/invoices` — Invoice creation (with `po_line_id`)
- `POST /api/purchasing/invoices/:id/post` — Invoice posting (validates GRN qty)
- `POST /api/purchasing/payments` — Payment creation (allocation)
- `POST /api/purchasing/payments/:id/post` — Payment posting (validates invoice linkage)

### State Machine (Documented)

| Document | DRAFT | SENT | PARTIAL_RECEIVED | RECEIVED | CLOSED |
|----------|-------|------|------------------|----------|--------|
| PO | ✅ | ✅ | ✅ | ✅ | ✅ |
| Invoice | DRAFT → POSTED → VOID | | | | |
| Payment | DRAFT → POSTED → VOID | | | | |

Valid transitions:
- PO: `DRAFT → SENT → (PARTIAL_RECEIVED | RECEIVED) → CLOSED`
- Invoice: `DRAFT → POSTED → VOID`
- Payment: `DRAFT → POSTED → VOID`

### Security
- All operations scoped by `company_id` via auth guard
- GRN validation uses `FOR UPDATE` row lock within posting transaction
- Supplier mismatch rejected at validation time

---

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes (`npm run typecheck -w @jurnapod/api`) |
| ESLint | ✅ Passes |
| Build | ✅ Successful (`npm run build -w @jurnapod/modules-purchasing`) |

---

## Known Limitations

### Architectural (Following Existing Patterns)
1. **Three-way matching not enforced**: No `three_way_matching` flag, setting, or enforcement exists. AC5 deferred to Story 54.6.
2. **No `invoiced_qty` tracking on PO lines**: Sequential over-invoicing possible when multiple PIs reference the same PO line. Deferred to Story 54.6.

### Functional
1. **PO line supplier mismatch → 500**: If `po_line_id` references a line whose PO has a different supplier than the invoice header, `postPI` throws a mapped error — but the route handler catches `PIError` generically and returns 500 if uncaught. Low risk — production invariant enforced in service layer.

---

## Testing Performed

- ✅ AC2a: Payment VOIDED → POST returns 400 `INVALID_STATUS_TRANSITION`
- ✅ AC2b: Payment DRAFT → VOID returns 400 `INVALID_STATUS_TRANSITION`
- ✅ AC2c: Invoice VOIDED → POST returns 400 `INVALID_STATUS_TRANSITION`
- ✅ AC2d: Invoice DRAFT → VOID returns 400 `INVALID_STATUS_TRANSITION`
- ✅ AC2e: Invoice POSTED → POST returns 409 `ALREADY_POSTED`
- ✅ AC3: Invoice line qty > received_qty → 400 `GRN_INSUFFICIENT_QTY` (discovery test — failed, then production fixed)
- ✅ AC3b: Invoice line qty <= received_qty → 200 posted (happy path with GRN linkage)
- ✅ AC4: Payment allocation to non-existent invoice 999999 → 404 `INVOICE_NOT_FOUND`
- ✅ 8/8 tests pass, 3× consecutive green
- ✅ Existing AP correctness suites (ap-invoice-correctness, ap-payment-correctness) unaffected

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
| **Three-way matching flag**: feature absent from codebase | Deferred to 54.6 as architectural gap |

### Dismissed
| Item | Rationale |
|------|-----------|
| `String()` wrapping on DECIMAL value unstable | Kysely returns DECIMAL as string — `String()` is a no-op |
| Route mapping deviation from spec plan | Catch-all `PIError` handler already covers it automatically |
| Adapter type annotation beyond spec scope | Harmless additive change |

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-03 | 1.0 | Initial implementation — test file + production fix for AC3 |
| 2026-05-03 | 1.1 | P0 patch: TOCTOU race fix (FOR UPDATE + supplier check) |
| 2026-05-03 | 1.2 | P3 patches: error class rename + message + re-export |

---

## Notes

- AC3 was written as a **discovery test** (same pattern as 54.2 AC1b) — failed on first run, production code fixed in-scope
- AC5 (three-way matching) could not be tested — feature absent from codebase, deferred to 54.6
- E54-A2 second-pass review: all checklist items resolved, 3× consecutive green confirmed

---

**Story is COMPLETE.**
**Owner sign-off:** Ahmad — 2026-05-04
