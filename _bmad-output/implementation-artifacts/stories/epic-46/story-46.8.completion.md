# Story 46.8 — AP Aging Report — Completion Report

## Story
- **ID:** 46.8
- **Title:** AP Aging Report
- **Epic:** 46 — Purchasing / Accounts Payable Module
- **Status:** ✅ DONE

## Implementation Summary

Implemented AP Aging as read-only purchasing report endpoints with supplier summary and invoice detail drill-down:

1. **ACL and report surface**
   - Added ACL seed migration for `purchasing.reports`
   - Added report routes under `/api/purchasing/reports/ap-aging` and `/api/purchasing/reports/ap-aging/:supplierId/detail`
   - Enforced ANALYZE access on `purchasing.reports`

2. **Aging computation logic**
   - Computes open amounts from posted invoices minus posted AP payments and applied supplier credits
   - Computes due date from stored invoice `due_date` (when present), else from payment terms fallback
   - Resolves bucket assignment: `current`, `due_1_30`, `due_31_60`, `due_61_90`, `due_over_90`
   - Produces supplier-level totals and grand totals

3. **Detail drill-down**
   - Returns per-invoice AP aging detail by supplier
   - Includes invoice number/date, due date, currency, original amount, open balance, base balance, bucket

4. **Hardening updates**
   - Added due-date precedence fix (prefer stored `purchase_invoices.due_date` over recomputation)
   - Added integration coverage for stored due-date bucket behavior

## Acceptance Criteria Coverage

| AC | Requirement | Status |
|---|---|---|
| AC1 | AP aging summary query with supplier rows + totals | ✅ |
| AC2 | Due-date calculation with terms fallback | ✅ |
| AC3 | Currency/base display in summary and detail | ✅ |
| AC4 | Supplier PI detail drill-down | ✅ |
| AC5 | ACL enforcement for `purchasing.reports` ANALYZE access | ✅ |

## Files Added / Modified

### Added
- `packages/db/migrations/0185_acl_purchasing_reports.sql`
- `apps/api/src/lib/purchasing/ap-aging-report.ts`
- `apps/api/src/routes/purchasing/reports/ap-aging.ts`
- `apps/api/src/routes/purchasing/reports/index.ts`
- `apps/api/__test__/integration/purchasing/ap-aging-report.test.ts`

### Modified
- `apps/api/src/routes/purchasing/index.ts`
- `packages/shared/src/constants/purchasing.ts`
- `packages/shared/src/schemas/purchasing.ts`
- `packages/shared/src/constants/roles.defaults.json`

## Validation Evidence

### Story suite
- `ap-aging-report.test.ts`: **5/5 pass**

### Purchasing regression subset
- `ap-aging-report.test.ts`: 5/5
- `purchase-credits.test.ts`: 6/6
- `ap-payments.test.ts`: 27/27
- `purchase-invoices.test.ts`: 15/15
- `purchase-orders.test.ts`: 27/27
- `goods-receipts.test.ts`: 21/21
- `exchange-rates.test.ts`: 26/26

**Total regression subset:** **127/127 passing**

## Notes

- Report is read-only and tenant-scoped.
- ACL defaults already include `purchasing.reports` for canonical roles; migration backfills existing companies.
