# Story 69-3-f Completion Report

**Story:** Financial Reports + CSV Export  
**Epic:** 69 - Architecture-First Backoffice Accounting Screens  
**Status:** ✅ DONE  
**Completed:** 2026-05-21

---

## Summary

Story 69-3-f implemented verified financial report contracts, CSV export endpoints, and backoffice report/export screens for trial balance, general ledger, AP ageing, and receivables ageing. The work corrected the original contract blockers by aligning AP ageing to `purchasing.reports`, aligning AR ageing to `/reports/receivables-ageing` and `customer_display_name`, adding report-specific streaming CSV endpoints, and adding focused tests plus reviewer-approved UI fixes.

---

## Files Created/Modified

### Created

| File | Description |
|------|-------------|
| `apps/api/src/lib/reports/csv-export.ts` | Shared CSV serialization helpers for financial report exports, including formula-leading text hardening. |
| `apps/api/__test__/unit/reports/csv-export.test.ts` | Unit coverage for CSV escaping, filenames, report serializers, and formula hardening. |
| `apps/api/__test__/integration/reporting/financial-report-csv-export.test.ts` | Real-DB integration coverage for report CSV auth, correctness, seeded trial balance/general ledger/AR/AP data, and invalid/outlet-scope behavior. |
| `apps/backoffice/src/lib/report-export-helpers.ts` | Backoffice report path, export path, filename, date default, and export-error helpers. |
| `apps/backoffice/__test__/unit/lib/report-export-helpers.test.ts` | Unit coverage for report path builders, export helper behavior, permission metadata, and error formatting. |
| `apps/backoffice/__test__/unit/lib/financial-report-routes.test.ts` | Focused route metadata and financial report page-export wiring coverage. |
| `apps/backoffice/__test__/unit/hooks/use-receivables-ageing.test.ts` | Receivables ageing hook/export/filter contract helper coverage. |

### Modified

| File | Changes |
|------|---------|
| `apps/api/src/routes/reports.ts` | Added trial balance, general ledger, and receivables ageing CSV endpoints plus OpenAPI schemas/error docs. |
| `apps/api/src/routes/purchasing/reports/ap-aging.ts` | Added AP ageing CSV export endpoint under `purchasing.reports` ANALYZE. |
| `apps/api/src/routes/purchasing/openapi.ts` | Added AP ageing CSV OpenAPI response coverage. |
| `apps/backoffice/src/features/reports-pages.tsx` | Added Trial Balance page, AP Ageing page, General Ledger export action, and centralized report helper usage. |
| `apps/backoffice/src/features/pages.tsx` | Exported Trial Balance and AP Ageing report pages. |
| `apps/backoffice/src/app/router.tsx` | Routed `/trial-balance` and `/purchasing/ap-aging`; preserved `/receivables-ageing` mapping. |
| `apps/backoffice/src/app/router/routes.tsx` | Added route constants and financial report route mapping helper. |
| `apps/backoffice/src/app/routes.ts` | Added resource-level report permission metadata and split `/journals` label from Trial Balance. |
| `apps/backoffice/src/hooks/use-breadcrumbs-logic.ts` | Updated `/journals` breadcrumb and added `/trial-balance` plus `/purchasing/ap-aging` breadcrumb labels. |
| `apps/backoffice/__test__/unit/app-router-guards-permissions.test.ts` | Aligned audit-log expectation to canonical `platform.audit.READ` and preserved existing guard behavior. |
| `apps/backoffice/src/hooks/use-receivables-ageing.ts` | Aligned AR report path and aggregation to verified backend contract. |
| `apps/backoffice/src/types/reports/receivables-ageing.ts` | Aligned AR types to `customer_display_name`, supported filters, and backend response shape. |
| `apps/backoffice/src/components/reports/receivables-ageing/ageing-export-button.tsx` | Switched AR export to server streaming endpoint, visible error handling, and zero-row export support. |
| `apps/backoffice/src/components/reports/receivables-ageing/ageing-filters.tsx` | Converted AR filters to controlled state. |
| `apps/backoffice/src/components/reports/receivables-ageing/ageing-table.tsx` | Aligned displayed customer values with backend contract. |
| `apps/backoffice/src/features/receivables-ageing-page.tsx` | Removed misleading client-generated report timestamp and preserved contract-aligned export. |
| `_bmad-output/implementation-artifacts/stories/epic-69/story-69-3-f.md` | Recorded implementation evidence, validations, review GO, and owner sign-off. |
| `_bmad-output/implementation-artifacts/stories/epic-69/story-69-3-f.readiness-coordination.md` | Recorded contract/UI readiness resolution, final review GO, and owner sign-off. |
| `_bmad-output/implementation-artifacts/stories/epic-69/story-69-3.md` | Updated split-control child status for 69-3-f to done. |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | Trial balance rows, totals, and filters display using verified API fields. | ✅ Complete |
| AC2 | General ledger rows display account, date, reference/doc, debit/credit, running balance when supported, and supported pagination. | ✅ Complete |
| AC3 | AP and AR ageing reports display bucket/totals data using verified contracts. | ✅ Complete |
| AC4 | CSV exports use `apiStreamingRequest()` or verified streaming-compatible endpoint semantics. | ✅ Complete |
| AC5 | Permission-aware reporting uses resource-level metadata and direct API attempts return 401/403 where applicable. | ✅ Complete |

---

## Key Features Implemented

### API Contracts and CSV Export

- Added report-specific CSV endpoints for trial balance, general ledger, receivables ageing, and AP ageing.
- Preserved actual endpoint paths and ACL split: accounting reports use `accounting.reports` ANALYZE; AP ageing uses `purchasing.reports` ANALYZE.
- Added CSV attachment headers with deterministic report-specific filenames.
- Added CSV serializers with text-cell formula injection protection.
- Added OpenAPI coverage for report JSON/CSV contracts and export error responses.

### Backoffice Reports

- Added dedicated `/trial-balance` route/page with filters, totals, rows, and CSV export.
- Added General Ledger CSV export while preserving the existing implicit `line_limit`/`line_offset` pagination contract.
- Added `/purchasing/ap-aging` route/page with suppliers, bucket totals, currency totals, and CSV export.
- Kept `/receivables-ageing` aligned to `customer_display_name`, `outlet_id`, and `as_of_date` backend contract.

### Permission and Navigation

- Added resource-level permission metadata for accounting report routes.
- Added AP ageing navigation metadata with `purchasing.reports` ANALYZE and purchasing module gating.
- Restored `/daily-sales` to legacy role-only metadata after review caught an out-of-scope permission regression.
- Split Trial Balance from the Journals label and breadcrumb.

---

## Technical Implementation

### Data Flow

```text
Report Filter Change → Backoffice path helper → API report endpoint → Verified response fields → Table/totals render
Export Click → apiStreamingRequest() → CSV endpoint → Content-Disposition filename → downloadStreamingResponse()
```

### API Endpoints Used

- `GET /api/reports/trial-balance` - Trial balance JSON report.
- `GET /api/reports/trial-balance/export?format=csv` - Trial balance CSV export.
- `GET /api/reports/general-ledger` - General ledger JSON report.
- `GET /api/reports/general-ledger/export?format=csv` - General ledger CSV export.
- `GET /api/reports/receivables-ageing` - AR/receivables ageing JSON report.
- `GET /api/reports/receivables-ageing/export?format=csv` - AR/receivables ageing CSV export.
- `GET /api/purchasing/reports/ap-aging` - AP ageing JSON report.
- `GET /api/purchasing/reports/ap-aging/export?format=csv` - AP ageing CSV export.

### State Management

- Report pages use local React state for filters, loading, errors, rows, totals, and pagination offsets.
- Shared helper functions build report/export paths to avoid field/path drift.
- Receivables ageing filters are controlled by parent state to keep displayed filters, report data, and export parameters aligned.

### Security

- API routes enforce authentication and resource-level ACL.
- Backoffice navigation uses resource-level permission metadata for report visibility.
- Negative API coverage uses underprivileged users for 401/403 assertions.
- Report CSV cells protect user-controlled text against formula-leading spreadsheet injection.

---

## Code Quality

| Check | Result |
|-------|--------|
| API TypeScript | ✅ Passes — `logs/story-69-3-f-review-api-typecheck-r3.log` |
| API ESLint | ✅ Passes — `logs/story-69-3-f-review-api-lint-r3.log` |
| Backoffice TypeScript | ✅ Passes — `logs/story-69-3-f-final-backoffice-typecheck-r3.log` |
| Backoffice ESLint | ✅ Passes — `logs/story-69-3-f-final-backoffice-lint-r2.log` |
| Backoffice Build | ✅ Passes — `logs/story-69-3-f-ui-review-backoffice-build.log` with existing Vite chunk warnings |
| Fixture Flow | ✅ Passes — `logs/story-69-3-f-review-fixture-flow.log` |

---

## Known Limitations

### Architectural

1. **General ledger pagination remains implicit**: The backend supports `line_limit`/`line_offset` but does not expose an explicit `pagination.total` or `has_more` envelope. The UI preserves this supported behavior and does not invent unsupported pagination fields.
2. **Generated backoffice OpenAPI schema not refreshed**: No repo codegen workflow was found. Runtime routes, OpenAPI route definitions, and focused tests were updated.

### Functional

1. **AP/AR omitted `as_of_date` fallback**: API export routes intentionally match existing JSON behavior by using current UTC date when omitted. Backoffice export callers pass explicit `as_of_date`.

---

## Testing Performed

- ✅ API CSV unit tests — `logs/story-69-3-f-review-api-csv-unit.log`.
- ✅ API CSV real-DB integration tests — `logs/story-69-3-f-review-api-csv-integration-r2.log`.
- ✅ Backoffice report helper tests — `logs/story-69-3-f-final-report-helpers-unit.log`.
- ✅ Receivables ageing helper/export/filter tests — `logs/story-69-3-f-final-receivables-unit.log`.
- ✅ Financial report route tests — `logs/story-69-3-f-final-financial-routes-unit-r3.log`.
- ✅ Existing app-router guard permissions suite — `logs/story-69-3-f-final-router-guards-unit-r2.log`.
- ✅ API lint/typecheck — `logs/story-69-3-f-review-api-lint-r3.log`, `logs/story-69-3-f-review-api-typecheck-r3.log`.
- ✅ Backoffice lint/typecheck/build — `logs/story-69-3-f-final-backoffice-lint-r2.log`, `logs/story-69-3-f-final-backoffice-typecheck-r3.log`, `logs/story-69-3-f-ui-review-backoffice-build.log`.
- ✅ Fixture-flow lint — `logs/story-69-3-f-review-fixture-flow.log`.

---

## Dead Code Audit

*Applies to extraction and consolidation stories only.*

### Checklist

- [x] **Orphaned exports**: Removed the unused legacy `JournalsPage` export from `reports-pages.tsx`; active journal CRUD/void page remains in `features/journals-page.tsx`.
- [x] **Orphaned type definitions**: Touched report types were aligned to actual contracts.
- [x] **Orphaned test files**: No story-created orphan test files identified.

### Findings

- [x] **Clean** — No blocker orphaned code found in modified story scope.

### Action Taken

- [x] **Deleted/updated** — Stale Journals/Trial Balance labels and route wiring were cleaned up during review-fix passes.

---

## API Gaps Encountered

| Gap | Discovered | Resolution |
|-----|-----------|------------|
| Missing CSV endpoints for financial reports | Architecture/readiness review before implementation | Added verified CSV endpoints for trial balance, general ledger, AP ageing, and receivables ageing. |
| AP ageing path/ACL mismatch | Architecture/readiness review | Implemented UI and tests against `/api/purchasing/reports/ap-aging` with `purchasing.reports` ANALYZE. |
| AR ageing path/field mismatch | Architecture/readiness review | Aligned backoffice to `/api/reports/receivables-ageing`, `customer_display_name`, and supported query fields. |
| General ledger lacks pagination envelope | Contract verification | Preserved only supported `line_limit`/`line_offset` behavior; tracked as known limitation. |

---

## Review Evidence

| Review | Task | Decision |
|--------|------|----------|
| Architecture readiness | `ses_1b85fb25affeD1gVTsSe3oqDAH` | NO-GO for UI until contract-first fixes; GO for contract work. |
| Contract/API review initial | `ses_1b8476fd7ffeUSnPoGMkp0caml` | NO-GO; P1/P2 fixes required. |
| Contract/API re-review | `ses_1b8476fd7ffeUSnPoGMkp0caml` | GO. |
| UI review initial | `ses_1b82594aaffe3NfruWoxWJRebq` | NO-GO; P1/P2/P3 fixes required. |
| UI final re-review | `ses_1b82594aaffe3NfruWoxWJRebq` | GO. |
| Final cleanup review | `ses_1b82594aaffe3NfruWoxWJRebq` | GO; no P0/P1/P2/P3 findings. |

---

## Dev Notes

### Pattern Consistency

- `apps/api/src/routes/reports.ts` and `apps/api/src/routes/purchasing/reports/ap-aging.ts` remain HTTP adapters that call report services and CSV helpers.
- `apps/backoffice/src/lib/report-export-helpers.ts` centralizes path and export helper logic to reduce drift across report pages.
- Backoffice report routes use resource-level permission metadata consistent with Epic 39.

### Type Safety

- Report response types and AR contract types were updated to verified backend fields.
- OpenAPI schemas were strengthened for report routes and export responses.

### Error Handling

- Streaming export failures surface visible messages for auth, permission, server, and network failures.
- API export routes return JSON errors for validation/auth/server failures and CSV only for successful exports.

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-21 | 1.0 | Contract-first report CSV endpoints, backoffice report pages, tests, review fixes, owner sign-off. |

---

## Notes

- Ahmad owner sign-off was received on 2026-05-21 via `sign-off`.
- Story was marked done only after reviewer GO plus owner sign-off were recorded.
- No commit was made.

---

**Story is COMPLETE.**
