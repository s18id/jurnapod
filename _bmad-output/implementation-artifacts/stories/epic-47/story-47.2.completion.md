# Story 47.2 — Reconciliation Drilldown & Variance Attribution — Completion Report

## Story
- **ID:** 47.2
- **Title:** Reconciliation Drilldown & Variance Attribution
- **Epic:** 47 — AP Reconciliation & Period Close Controls
- **Status:** ✅ DONE

---

## Implementation Summary

- Added Story 47.2 drilldown domain service and endpoints under canonical namespace:
  - `GET /api/purchasing/reports/ap-reconciliation/drilldown`
  - `GET /api/purchasing/reports/ap-reconciliation/gl-detail`
  - `GET /api/purchasing/reports/ap-reconciliation/ap-detail`
  - `GET /api/purchasing/reports/ap-reconciliation/export?format=csv`
- Enforced ACL on all Story 47.2 read endpoints: `purchasing.reports` + `ANALYZE`.
- Implemented deterministic variance categorization and CSV export parity with drilldown dataset.
- Preserved Story 47.1 behavior invariants:
  - fail-closed when settings unresolved
  - strict tenant scoping by `company_id`
  - timezone precedence `outlet.timezone -> company.timezone` (no UTC fallback)
  - FX semantics unchanged (`base = original * rate`)

### Post-implementation bug fixes (critical)

- **Fix 1:** AP payment amount source in AP detail/drilldown
  - Replaced non-existent `ap_payments.total_amount` with aggregated sum from `ap_payment_lines.allocation_amount`.
- **Fix 2:** GL detail journal batch projection
  - Replaced non-existent `journal_batches.batch_no` and `journal_batches.effective_date` with canonical fields:
    - `journal_number` derived from `journal_batches.id`
    - `effective_date` derived from `DATE(journal_batches.posted_at)`
- **Fix 3:** GL source mapping fields
  - Replaced non-existent `journal_lines.source_type/source_id` with `journal_batches.doc_type/doc_id` for deterministic linking.
- **Fix 4:** Cursor filtering SQL
  - Removed raw `?` cursor fragment and replaced with bound SQL fragment for safe, deterministic pagination.
- **Fix 5:** Canonical `doc_type` case normalization for GL↔AP matching
  - Added shared mapping constant `DOC_TYPE_TO_PURCHASING_AP_TRANSACTION_TYPE` in `@jurnapod/shared` with canonical values:
    - `PURCHASE_INVOICE -> purchase_invoice`
    - `AP_PAYMENT -> ap_payment`
    - `PURCHASE_CREDIT -> purchase_credit`
  - Added thin helper `normalizePurchasingDocType()` in `@jurnapod/shared` so both GL `doc_type` and AP `type` use the same normalization path.
- **Fix 6:** Tenant-scoped allocation aggregation in AP detail
  - Scoped `ap_payment_lines` aggregation by tenant using join/filter on `ap_payments.company_id` to avoid cross-tenant full-table aggregation in subquery.

---

## Validation Evidence

- `npm run test:single -w @jurnapod/api -- __test__/integration/purchasing/ap-reconciliation.test.ts` → ✅ **50/50**
- `npm run test:single -w @jurnapod/api -- __test__/integration/purchasing` → ✅ **217/217**
- `npm run build -w @jurnapod/shared` → ✅
- `npm run typecheck -w @jurnapod/api` → ✅

---

## Files Changed

- `apps/api/src/lib/purchasing/ap-reconciliation-drilldown.ts` (new + stabilized)
- `apps/api/src/routes/purchasing/reports/ap-reconciliation.ts` (new Story 47.2 endpoints)
- `apps/api/__test__/integration/purchasing/ap-reconciliation.test.ts` (Story 47.2 coverage)
- `packages/shared/src/schemas/purchasing.ts` (query/response schema contracts)

---

## Risk Outcome

- **P0:** No unresolved P0 issues observed in Story 47.2 package.
- **P1:** No unresolved P1 issues observed after column/field compatibility fixes.
