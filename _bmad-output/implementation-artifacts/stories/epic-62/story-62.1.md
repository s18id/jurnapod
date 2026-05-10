# Story 62.1: Projection Source-of-Truth Boundary Map + AR/AP Projection Accuracy

**Status:** ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 62 --story 62-1 --title projection-source-of-truth-boundary-map-ar-ap-accuracy --status done --title`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **financial auditor**,
I want **a documented boundary map between projection outputs and source-of-truth subledger data, with zero variance evidence**,
so that **projection correctness is provably machine-verifiable and the READ-only boundary is enforced**.

## Context

- **Source:** Epic 62 (FR1, FR4, FR5 partial) — Projection Correctness Hardening
- **Predecessor:** Epic 61 (AR/AP subledger reconciliation tests passing)
- **Scope:** `apps/api/src/routes/reports.ts`, `packages/modules/reporting/src/reports/services.ts`, `packages/modules/purchasing`, `packages/modules/accounting`
- **Risk:** P0 — material variance in projection outputs corrupts financial reporting integrity
- **Epic exit gate:** `__EPIC62_GATE__` JSON lines with variance == 0 for all reconciliation tests

### Preconditions

| # | Precondition | Enforcement | Status |
|---|--------------|-------------|--------|
| 1 | Epic 61 close + retro complete | sprint-status | ✅ DONE |
| 2 | `npm run lint -w @jurnapod/api` passes | pre-flight gate | ✅ |
| 3 | `npm run typecheck -w @jurnapod/api` passes | pre-flight gate | ✅ |
| 4 | `validate-sprint-status.ts --epic 62` exits 0 | pre-flight gate | ✅ |

---

## Projection → Source-of-Truth Boundary Map

Document the concrete mapping between projection/report outputs and their source-of-truth tables.

### Boundary Map Table

| Projection / Report | Source-of-Truth Tables | Canonical Package | Variance Tolerance |
|---------------------|------------------------|-------------------|--------------------|
| **AR Aging** (`GET /reports/receivables-ageing`) | `sales_invoices` (status=POSTED, outstanding = grand_total - paid_total), `customers`, `outlets` | `packages/modules/reporting` (`getReceivablesAgeingReport` in `reports/services.ts`) | **0 (exact match)** |
| **AP Aging** (`GET /purchasing/reports/ap-aging`) | `purchase_invoices` (status=POSTED), `ap_payments`, `ap_payment_lines`, `purchase_credits`, `purchase_credit_lines`, `suppliers` | `packages/modules/purchasing` (`ApAgingReportService`) | **0 (exact match)** |
| **GL Trial Balance** (`GET /reports/trial-balance`) | `journal_batches`, `journal_lines`, `accounts` | `packages/modules/reporting` (`getTrialBalance` in `reports/services.ts`) | **0 (exact match)** |
| **GL General Ledger** (`GET /reports/general-ledger`) | `journal_batches`, `journal_lines`, `accounts` | `packages/modules/reporting` (`getGeneralLedgerDetail`) | **0 (exact match)** |
| **GL Profit & Loss** (`GET /reports/profit-loss`) | `journal_lines` WHERE `report_group IN ('PL', 'LR')` | `packages/modules/reporting` (`getProfitLoss`) | **0 (exact match)** |
| **GL Balance Sheet Worksheet** (`GET /reports/worksheet`) | `journal_lines`, `accounts` | `packages/modules/reporting` (`getTrialBalanceWorksheet`) | **0 (exact match)** |
| **Daily Sales** (`GET /reports/daily-sales`) | `pos_transactions`, `pos_transaction_items`, `pos_transaction_payments` | `packages/modules/reporting` (`listDailySalesSummary`) | **0 (exact match)** |

### AR Aging Projection — Source-of-Truth Formula

```
outstanding_amount = grand_total - paid_total
age_bucket =
  days_overdue <= 0 → "current"
  days_overdue 1-30 → "1_30_days"
  days_overdue 31-60 → "31_60_days"
  days_overdue 61-90 → "61_90_days"
  days_overdue > 90 → "over_90_days"

days_overdue = as_of_date - COALESCE(due_date, invoice_date)
```

**AR subledger aggregate:**
```
SUM(grand_total - paid_total) WHERE status = 'POSTED' GROUP BY age_bucket
```

**Variance formula:**
```
variance = AR_aging_total - SUM(sales_invoices.outstanding for company)
variance MUST be exactly "0.0000"
```

### AP Aging Projection — Source-of-Truth Formula

The AP aging projection operates in **base currency** (IDR). The service (`ApAgingReportService.getAPAgingSummary`) computes:

```
base_total = ROUND(pi.grand_total * pi.exchange_rate, 4)
paid_base = COALESCE(SUM(ap_payments.amount_applied), 0)
credited_base = COALESCE(SUM(purchase_credits.amount_applied), 0)
open_amount_base = base_total - paid_base - credited_base
```

The response returns `grand_totals.base_open_amount` (base currency total) and per-supplier `base_open_amount`.

**AP subledger aggregate (source-of-truth):**
```
SUM(base_total - paid_base - credited_base) 
FROM purchase_invoices pi
LEFT JOIN aggregated payments ON pi.id
LEFT JOIN aggregated credits ON pi.id
WHERE pi.company_id = :companyId AND pi.status = 'POSTED'
```

**Variance formula:**
```
variance = projection.grand_totals.base_open_amount - subledger_aggregate
variance MUST be exactly "0.0000"
```

Note: Supplier-currency totals (`total_open_amount`) are NOT used for variance comparison — they depend on per-invoice exchange rates which may differ from the subledger's base-currency aggregation.

---

## Acceptance Criteria

**AC1: Boundary map documented**
**Given** the story scope,
**When** the story is implemented,
**Then** a markdown table mapping each projection to its source-of-truth tables, columns, and aggregation formula is committed to the story file,
**And** the canonical package owning each projection is identified.

**AC2: AR Aging projection matches source subledger with zero variance**
**Given** a company with posted sales invoices having various due dates and payment states,
**When** `GET /reports/receivables-ageing` is called with `as_of_date`,
**Then** `SUM(outstanding_amount)` across all age buckets equals `SUM(grand_total - paid_total)` from `sales_invoices` WHERE `status = 'POSTED'` AND `company_id = :companyId`,
**And** `variance == 0` in `__EPIC62_GATE__` JSON evidence.

**AC3: AP Aging projection matches source subledger with zero variance**
**Given** a company with posted purchase invoices, applied payments, and applied credits,
**When** `GET /purchasing/reports/ap-aging` is called with `as_of_date`,
**Then** `grand_totals.base_open_amount` from the projection response equals `SUM(base_total - paid_base - credited_base)` from the source-of-truth subledger query (base currency, company-scoped),
**And** `variance == 0` in `__EPIC62_GATE__` JSON evidence.

**AC4: GL Trial Balance matches journal aggregates with zero variance**
**Given** a fiscal year with posted journal batches and lines,
**When** `GET /reports/trial-balance` is called for that fiscal year,
**Then** `SUM(debit)` across all accounts equals `SUM(credit)` (trial balance must balance),
**And** the per-account balance equals `SUM(jl.debit - jl.credit)` from `journal_lines` for that account.

**AC5: Deterministic projection outputs**
**Given** stable source data (no concurrent writes during test),
**When** any projection endpoint is called twice with identical parameters,
**Then** both responses return identical numeric outputs (byte-for-byte equality of monetary fields).

**AC6: `__EPIC62_GATE__` evidence emitted for each reconciliation test**
**When** each integration test verifies variance == 0,
**Then** the test console.logs a line matching:
```
__EPIC62_GATE__ {"test":"<test_name>","projection":"<name>","variance":0,"timestamp":"<ISO8601>"}
```
**And** `npx tsx scripts/validate-epic-62-gates.ts` exits 0 after all tests pass.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [x] **Happy paths identified:** AR aging zero-variance match, AP aging zero-variance match, GL trial balance zero-variance match
- [x] **Error paths identified:** Unauthenticated request (401), CASHIER role forbidden (403), tenant cross-check (404 if wrong company)
- [x] **Edge cases identified:** Zero-state company (no invoices → variance 0, empty response), fixed deterministic date ("2099-12-31"), isolated company for seeded data
- [x] **Test fixture needs identified:** Canonical fixture functions already exist in `__test__/fixtures`; isolated company with seeded invoice+JL data for variance=0 assertions
- [x] **Integration test scope defined:** Real DB tests via `getDb()`; HTTP route tests via `getJson`/`postJson` helpers
- [x] **Negative auth test role selected:** `CASHIER` for permission-gated routes (not OWNER/SUPER_ADMIN)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| AR aging: zero-state company → variance 0 | Happy | Integration |
| AR aging: seeded invoice → matches subledger, variance 0 | Happy | Integration |
| AP aging: seeded invoice+payment+credit → matches subledger, variance 0 | Happy | Integration |
| GL Trial Balance: seeded journal lines → balances and matches GL | Happy | Integration |
| Repeated calls: deterministic output | Happy | Integration |
| AR aging: unauthenticated → 401 | Error | Integration |
| AP aging: CASHIER role → 403 | Error | Integration |
| AR aging: cross-company tenant isolation | Error | Integration |

**Sign-off:** Test scenarios reviewed before implementation begins.

---

## Tasks / Subtasks

- [ ] Task 1: Document projection→source-of-truth boundary map (AC: 1)
  - [ ] 1.1 Create boundary map table with all projections identified in Epic 62 scope
  - [ ] 1.2 Document AR aging aggregation formula and source columns
  - [ ] 1.3 Document AP aging aggregation formula and source columns
  - [ ] 1.4 Document GL Trial Balance aggregation formula and source columns
- [ ] Task 2: AR Aging reconciliation integration tests (AC: 2, 5, 6)
  - [ ] 2.1 Create `apps/api/__test__/integration/reporting/ar-aging-projection-reconciliation.test.ts`
  - [ ] 2.2 Implement zero-state test: variance == 0 with no invoices
  - [ ] 2.3 Implement seeded data test: seeded POSTED invoice matches `SUM(grand_total - paid_total)`
  - [ ] 2.4 Add `__EPIC62_GATE__` JSON evidence emission
  - [ ] 2.5 Verify deterministic output across repeated calls
- [ ] Task 3: AP Aging reconciliation integration tests (AC: 3, 5, 6)
  - [ ] 3.1 Create `apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts`
  - [ ] 3.2 Implement zero-state test: variance == 0 with no purchase invoices
  - [ ] 3.3 Implement seeded data test: seeded POSTED invoice + applied payment + applied credit → matches subledger
  - [ ] 3.4 Add `__EPIC62_GATE__` JSON evidence emission
  - [ ] 3.5 Verify deterministic output across repeated calls
- [ ] Task 4: GL Trial Balance reconciliation integration tests (AC: 4, 5, 6)
  - [ ] 4.1 Create `apps/api/__test__/integration/reporting/gl-trial-balance-reconciliation.test.ts`
  - [ ] 4.2 Verify trial balance debits == credits
  - [ ] 4.3 Verify per-account balance matches `journal_lines` aggregate
  - [ ] 4.4 Add `__EPIC62_GATE__` JSON evidence emission
  - [ ] 4.5 Verify deterministic output across repeated calls
- [ ] Task 5: Gate validation script (AC: 6 — Story 62.6 scope, stub here)
  - [ ] 5.1 Document `scripts/validate-epic-62-gates.ts` interface (to be implemented in Story 62.6)

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/__test__/integration/reporting/ar-aging-projection-reconciliation.test.ts` | AR aging projection vs source-of-truth subledger reconciliation tests |
| `apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts` | AP aging projection vs source-of-truth subledger reconciliation tests |
| `apps/api/__test__/integration/reporting/gl-trial-balance-reconciliation.test.ts` | GL Trial Balance vs journal_lines reconciliation tests |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/reports.ts` | Audit | Verify AR aging (`/reports/receivables-ageing`) uses `getReceivablesAgeingReport` from `packages/modules/reporting` — thin adapter only |
| `apps/api/src/routes/purchasing/reports/ap-aging.ts` | Audit | Verify AP aging uses `ApAgingReportService` from `packages/modules-purchasing` — thin adapter only |
| `packages/modules/reporting/src/reports/services.ts` | Audit | Verify `getReceivablesAgeingReport` and `getTrialBalance` query source tables directly without abstraction leakage |

## Estimated Effort

3 days

## Risk Level

P0 — Material variance in projection outputs corrupts financial reporting integrity. Zero tolerance required.

## Dev Notes

### Pre-existing code to leverage

- **AR aging route:** `apps/api/src/routes/reports.ts` lines 557-626 (`GET /reports/receivables-ageing`)
- **AR aging implementation:** `packages/modules/reporting/src/reports/services.ts` `getReceivablesAgeingReport()` — queries `sales_invoices` directly
- **AP aging route:** `apps/api/src/routes/purchasing/reports/ap-aging.ts` — thin adapter delegating to `ApAgingReportService`
- **AP aging implementation:** `@jurnapod/modules-purchasing` `ApAgingReportService.getAPAgingSummary()`
- **AR subledger reconciliation tests:** `apps/api/__test__/integration/accounting/ar-subledger-reconciliation.test.ts` — patterns for `__EPIC62_GATE__` emission and seeded variance=0 tests
- **AP subledger reconciliation tests:** `apps/api/__test__/integration/accounting/ap-subledger-reconciliation.test.ts` — same patterns
- **AP aging integration tests:** `apps/api/__test__/integration/purchasing/ap-aging-report.test.ts` — canonical fixture flow for AP aging

### Canonical datetime pattern

All aging reports use `as_of_date` as YYYY-MM-DD. The `FIXED_AS_OF_DATE = "2099-12-31"` pattern from Epic 61 reconciliation tests should be used for deterministic isolation.

### `__EPIC62_GATE__` evidence pattern

Follow the pattern established in Epic 61 reconciliation tests:
```typescript
console.log(JSON.stringify({
  test: expect.getState().currentTestName ?? "unknown",
  projection: "ar-aging",
  variance: "0.0000",
  timestamp: new Date().toISOString()
}));
```

### Key invariant to preserve

The projection is a **READ-only** operation — it must never write to any financial table. The boundary map documents this invariant. Implementation must verify no `INSERT`/`UPDATE`/`DELETE` paths exist in report routes.

### AR Aging source-of-truth query (canonical)

```sql
SELECT
  DATEDIFF(:as_of_date, COALESCE(due_date, invoice_date)) AS days_overdue,
  (grand_total - paid_total) AS outstanding_amount
FROM sales_invoices
WHERE company_id = :companyId
  AND status = 'POSTED'
  AND outlet_id IN (:outletIds)
  AND (grand_total - paid_total) > 0
```

### AP Aging source-of-truth query (canonical)

The AP aging computation is more complex because it involves allocation of payments and credits:
- `open_amount = purchase_invoices.grand_total - SUM(ap_payments.amount WHERE applied) - SUM(purchase_credits.qty * unit_price WHERE applied)`
- Source-of-truth for the projection accuracy test: verify `SUM(open_amount)` across all buckets equals direct SQL aggregate from `purchase_invoices` joined with applied payments/credits

### Permission conventions

- AR aging: `accounting.reports` with `ANALYZE` permission
- AP aging: `purchasing.reports` with `ANALYZE` permission
- GL reports: `accounting.reports` with `ANALYZE` permission

## Validation Evidence

```bash
# Run AR aging reconciliation tests
npx vitest run apps/api/__test__/integration/reporting/ar-aging-projection-reconciliation.test.ts --reporter=verbose 2>&1 | grep "__EPIC62_GATE__"

# Run AP aging reconciliation tests
npx vitest run apps/api/__test__/integration/reporting/ap-aging-projection-reconciliation.test.ts --reporter=verbose 2>&1 | grep "__EPIC62_GATE__"

# Run GL trial balance reconciliation tests
npx vitest run apps/api/__test__/integration/reporting/gl-trial-balance-reconciliation.test.ts --reporter=verbose 2>&1 | grep "__EPIC62_GATE__"

# Gate validation (Story 62.6)
npx tsx scripts/validate-epic-62-gates.ts
# Expected: exit 0 with all gates green
```

## Dependencies

- Epic 61 close gates (AR/AP subledger reconciliation tests passing)
- `packages/modules/reporting` (`getReceivablesAgeingReport`, `getTrialBalance`)
- `packages/modules/purchasing` (`ApAgingReportService`)
- Canonical fixture functions in `apps/api/src/lib/test-fixtures.ts`

---

## Dev Agent Record

### Agent Model Used

MiniMax-M2.7

### Debug Log References

### Completion Notes List

### File List
