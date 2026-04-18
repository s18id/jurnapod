# Story 44.4 Completion Notes — Receivables Ageing Reporting Completion

**Story:** 44.4 — Receivables Ageing Reporting Completion  
**Epic:** Epic 44 — AR Customer Management & Invoicing Completion  
**Status:** ✅ DONE  
**Completed:** 2026-04-18

---

## Acceptance Criteria Evidence

### AC1: Customer join fields in ageing rows ✅
- Receivables ageing query extended with `LEFT JOIN customers`.
- Added fields in row/output contract:
  - `customer_id`
  - `customer_code`
  - `customer_type`
  - `customer_display_name`
- Rows without customer remain returned with customer fields as `NULL`.

### AC2: Overdue flag ✅
- `overdue` derived from `days_overdue > 0` in service mapping.
- Existing bucket semantics preserved.

### AC3: Drill-down endpoint ✅
- Added `GET /reports/receivables-ageing/customer/:customerId`.
- Verifies customer belongs to authenticated company.
- Reuses outlet filter behavior and report execution path.

### AC4: Contract support for drill-down integration ✅
- Reporting module types and API response include customer fields and overdue flag.

### AC5: ACL enforcement ✅
- Endpoint enforces `accounting.reports.ANALYZE` and outlet access filters.

### AC6: Integration tests ✅
- Added Story 44.4 integration suite:
  - customer fields present/nullable behavior
  - overdue true/false behavior
  - drill-down filtering + outlet scoping
  - ACL denial + 404 for non-existent customer

---

## Files Implemented

- `packages/modules/reporting/src/reports/services.ts`
- `packages/modules/reporting/src/reports/types.ts`
- `apps/api/src/routes/reports.ts`
- `apps/api/src/lib/reports.ts`
- `apps/api/__test__/integration/reports/receivables-ageing-44-4.test.ts`

---

## Validation Evidence

```bash
npm run build -w @jurnapod/modules-reporting
npm run build -w @jurnapod/api
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/api
npm test -w @jurnapod/api -- --run --testNamePattern="receivables-ageing"
```

Observed in final hardening run:
- Full API suite: **142/142 test files passed**, **1038 passed**, **3 skipped**, **0 failed**.
