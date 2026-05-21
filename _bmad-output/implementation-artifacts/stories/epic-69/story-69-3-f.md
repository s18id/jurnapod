# Story 69-3-f: Financial Reports + CSV Export

Status: done — reviewer GO recorded and Ahmad owner sign-off received on 2026-05-21

## Readiness Status

- 2026-05-20 architecture readiness review: **NO-GO for implementation as written**.
- Coordination record: `story-69-3-f.readiness-coordination.md`.
- Primary reason: endpoint paths and ACL assumptions in this story do not match actual routes, and required CSV export contracts are not verified for trial balance, general ledger, AP aging, or receivables aging.
- 2026-05-21 unfreeze update: Ahmad wrote `unfreeze` for Story 69-3-f. This authorizes contract-first readiness work and later backoffice report/export implementation after report contracts are corrected and reviewed.
- 2026-05-21 architecture follow-up: task `ses_1b85fb25affeD1gVTsSe3oqDAH` returned **NO-GO for UI implementation** and **GO only for contract-first readiness/rescope work**.
- 2026-05-21 contract-first batch: API CSV export endpoints were added for trial balance, general ledger, receivables ageing, and AP aging; AR backoffice contract helpers were aligned to `/api/reports/receivables-ageing`, `customer_display_name`, and `outlet_id`/`as_of_date` query parameters.
- 2026-05-21 independent review `ses_1b8476fd7ffeUSnPoGMkp0caml`: **NO-GO** until CSV tests prove correctness with posted accounting/AP/AR data and AR export error UX is hardened.
- 2026-05-21 review-fix batch: CSV export integration tests now seed posted accounting, AR, and AP datasets through canonical fixtures/production flows and assert report values; AR streaming export errors now surface user-visible messages; CSV text cells now harden spreadsheet formula-leading text.
- 2026-05-21 independent review `ses_1b8476fd7ffeUSnPoGMkp0caml`: Ahmad reported review **GO** after required contract-first fixes.
- 2026-05-21 backoffice UI batch: trial balance route/page, general-ledger CSV export, AP ageing route/page/export, receivables route rendering, report export helpers, and route permission metadata were implemented. Story remains in progress pending final review and story owner sign-off.
- 2026-05-21 UI review task `ses_1b82594aaffe3NfruWoxWJRebq`: **NO-GO** due missing UI/report tests, uncontrolled AR filters, disabled zero-row AR export, stale journals label, and client-generated AR timestamp. Required fixes were implemented in the UI review-fix batch; story remains in progress pending review and owner sign-off.
- 2026-05-21 final UI review task `ses_1b82594aaffe3NfruWoxWJRebq`: **GO** after review fixes and cleanup follow-up.
- 2026-05-21 owner sign-off: Ahmad wrote `sign-off`; completion report created at `story-69-3-f.completion.md`.

## Story

As a **financial controller or accountant**,  
I want **financial reports with filters and CSV export**,  
So that **I can review trial balance, general ledger, AP aging, and AR aging data with auditable export behavior**.

## Scope

Implement backoffice report pages for trial balance, general ledger, AP aging, AR aging, filters/date ranges, pagination where contract-supported, and CSV export via the canonical streaming client. This story MUST NOT invent report fields not returned by verified APIs.

## Dependencies

- 69-3-a Accounting Contract + Fixture Readiness — MUST be complete or explicitly signed off for this slice.
- Epic 65 typed API client and `apiStreamingRequest()` — MUST be complete.
- Epic 66 permission-aware navigation — MUST be complete.
- Explicit backoffice unfreeze authorization — MUST be recorded in this story before implementation.

## Backoffice Unfreeze Gate

- [x] Explicit unfreeze authorization recorded by story owner for Story 69-3-f — Ahmad wrote `unfreeze` on 2026-05-21.
- [x] Authorization scope includes financial report screens, exports, and tests after contract-first readiness is achieved.
- [x] If authorization is absent, implementation MUST NOT start — authorization is now recorded; contract blockers still require correction before UI implementation.

## Acceptance Criteria

**AC1: Trial balance report**  
Given a selected date range, when the report loads, then trial balance rows, totals, and filters display using verified API fields.

**AC2: General ledger report**  
Given selected filters, when general ledger loads, then rows display account, date, reference, debit/credit, running balance when supported, and pagination when supported.

**AC3: AP and AR aging reports**  
Given report filters, when AP aging or AR aging loads, then aging buckets and totals display using verified contract fields.

**AC4: CSV export uses streaming client**  
Given a report export button, when export is triggered, then CSV is downloaded via `apiStreamingRequest()` or a verified equivalent streaming path with correct auth/error semantics.

**AC5: Permission-aware reporting**  
Given a user lacks `accounting.reports` ANALYZE/READ permission, when report pages render, then navigation/actions are hidden and direct API attempts return 403.

## API Contract Verification Requirements

| Endpoint | Method | Expected Verification | Result |
|----------|--------|----------------------|--------|
| `/api/reports/trial-balance` | GET | Query params, row schema, totals, date handling, error shape | Actual endpoint; ACL `accounting.reports` ANALYZE. |
| `/api/reports/trial-balance/export?format=csv` | GET | CSV headers, content type, auth, filename, streaming client compatibility | Added; returns `text/csv` attachment with `trial-balance-{date}.csv`. |
| `/api/reports/general-ledger` | GET | Query params, pagination, row schema, totals/running balance fields | Actual endpoint; ACL `accounting.reports` ANALYZE; pagination remains implicit via `line_limit`/`line_offset`. |
| `/api/reports/general-ledger/export?format=csv` | GET | CSV headers, content type, auth, filename, streaming client compatibility | Added; returns `text/csv` attachment with `general-ledger-{date}.csv`. |
| `/api/purchasing/reports/ap-aging` | GET | Query params, bucket schema, totals | Actual endpoint; ACL `purchasing.reports` ANALYZE. |
| `/api/purchasing/reports/ap-aging/export?format=csv` | GET | CSV headers, content type, auth, filename, streaming client compatibility | Added; returns `text/csv` attachment with `ap-aging-{as_of_date}.csv`. |
| `/api/reports/receivables-ageing` | GET | Query params, bucket schema, totals | Actual endpoint; ACL `accounting.reports` ANALYZE; query supports `outlet_id` and `as_of_date`; invoice customer display field is `customer_display_name`. |
| `/api/reports/receivables-ageing/export?format=csv` | GET | CSV headers, content type, auth, filename, streaming client compatibility | Added; returns `text/csv` attachment with `receivables-ageing-{as_of_date}.csv`. |

### Readiness Findings — 2026-05-20

| Contract Item | Result |
|---------------|--------|
| Trial balance | Actual endpoint is `GET /api/reports/trial-balance`; no verified CSV export endpoint. |
| General ledger | Actual endpoint is `GET /api/reports/general-ledger`; pagination is implicit via `line_limit`/`line_offset` and response lacks explicit pagination envelope; no verified CSV export endpoint. |
| AP aging | Actual endpoint is `GET /api/purchasing/reports/ap-aging`; ACL is `purchasing.reports` ANALYZE, not `accounting.reports`. |
| AR aging | Actual endpoint is `GET /api/reports/receivables-ageing`, not `/api/reports/ar-aging`; current client assumptions require contract alignment. |
| CSV export | No verified CSV endpoints exist for this story's required reports. Generic export supports inventory items/prices only; AP reconciliation export is unrelated. |
| Route permissions | Story-level permission model must be split between `accounting.reports` and `purchasing.reports` unless AP aging is removed from this slice. |

### Contract-First Resolution — 2026-05-21

| Contract Item | Result |
|---------------|--------|
| Trial balance CSV | `GET /api/reports/trial-balance/export?format=csv` added; uses JSON query params plus optional `format=csv`; ACL `accounting.reports` ANALYZE. |
| General ledger CSV | `GET /api/reports/general-ledger/export?format=csv` added; uses JSON query params plus optional `format=csv`; ACL `accounting.reports` ANALYZE. |
| AP aging CSV | `GET /api/purchasing/reports/ap-aging/export?format=csv` added; uses `as_of_date` plus optional `format=csv`; ACL `purchasing.reports` ANALYZE. |
| AR / receivables CSV | `GET /api/reports/receivables-ageing/export?format=csv` added; uses `outlet_id`/`as_of_date` plus optional `format=csv`; ACL `accounting.reports` ANALYZE. |
| Backoffice AR contract | Hook/query helpers now call `/api/reports/receivables-ageing` with `outlet_id` and `as_of_date` only, and aggregate invoice rows using `customer_display_name`. |
| Navigation metadata | Report routes in backoffice navigation now include resource-level permission metadata for report access. |
| CSV correctness tests | Integration coverage now verifies posted manual journal rows/totals in trial balance and general ledger CSV, AR ageing customer display/buckets/totals/outlet scope, and AP ageing supplier buckets/grand totals. |
| CSV formula injection | CSV helper protects formula-leading text cells (`=`, `+`, `-`, `@`) while preserving numeric amount strings. |
| AP/AR omitted `as_of_date` fallback | Export routes intentionally reuse the existing JSON route deterministic fallback: current UTC date from `fromUtcIso.dateOnly(nowUTC())`. UI callers MUST pass explicit `as_of_date` for business-date reports. |

### Backoffice UI Implementation — 2026-05-21

| UI Item | Result |
|---------|--------|
| Trial balance | Added dedicated `/trial-balance` backoffice route/page using `GET /api/reports/trial-balance`; displays outlet/fiscal-year/date filters, totals, row table, and CSV export via `GET /api/reports/trial-balance/export?format=csv`. |
| General ledger | Existing `/general-ledger` page now uses centralized contract path helpers and exposes CSV export via `GET /api/reports/general-ledger/export?format=csv`; line pagination remains limited to supported `line_limit`/`line_offset`. |
| AP ageing | Added `/purchasing/ap-aging` route/page using `GET /api/purchasing/reports/ap-aging`; displays `suppliers[]`, bucket totals, currency totals, and CSV export via `GET /api/purchasing/reports/ap-aging/export?format=csv`. |
| AR / receivables ageing | Existing route rendering now maps `/receivables-ageing` to the contract-aligned page that uses the streaming export button. |
| Permission metadata | Added/verified `accounting.reports` ANALYZE metadata for trial balance/general ledger/receivables and `purchasing.reports` ANALYZE metadata for AP ageing. |
| Date defaults | New report helper defaults use canonical shared date helpers plus Temporal arithmetic; UI callers pass explicit report dates to export endpoints. |
| Export UX | New report export helper uses `apiStreamingRequest()`, parses `Content-Disposition` filenames, downloads through the streaming download helper, and surfaces 401/403/500/network export errors visibly. |
| Cleanup | Removed the unused legacy `JournalsPage` export from `reports-pages.tsx`; the active journal CRUD/void page remains `features/journals-page.tsx`. |

### Backoffice UI Validation Evidence — 2026-05-21

| Command | Log | Result |
|---------|-----|--------|
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/lib/report-export-helpers.test.ts` | `logs/story-69-3-f-backoffice-report-helpers-unit.log` | PASS — 8 tests. |
| `npm run typecheck -w @jurnapod/backoffice` | `logs/story-69-3-f-backoffice-ui-typecheck-r2.log` | PASS — no TypeScript errors logged. |
| `npm run lint -w @jurnapod/backoffice` | `logs/story-69-3-f-backoffice-ui-lint-r2.log` | PASS — no ESLint findings logged. |
| `npm run build -w @jurnapod/backoffice` | `logs/story-69-3-f-backoffice-ui-build-r2.log` | PASS — production build completed; Vite emitted existing chunk-size/chunking warnings. |

### UI Review Fixes — 2026-05-21

| Finding | Fix |
|---------|-----|
| P1 missing UI/report tests | Added focused route metadata/render-wiring tests and expanded report export helper tests. Coverage verifies `/trial-balance`, `/general-ledger`, `/purchasing/ap-aging`, and `/receivables-ageing` permissions, page-export route mapping, general-ledger `line_limit`/`line_offset` behavior, and streaming export success/error paths. |
| P2 AR ageing filters uncontrolled | `AgeingFilters` now uses controlled `value`/`onChange` inputs and derives parent filter state through `buildNextReceivablesAgeingFilters`. |
| P2 AR export disabled for zero-row reports | `AgeingExportButton` now enables export whenever a report object exists; zero-row reports remain auditable. |
| P3 stale journals label | `/journals` navigation label changed from `Journals & Trial Balance` to `Journals`; `/trial-balance` remains the dedicated trial balance report route. |
| P3 client generated-at timestamp | Removed client-side `new Date()` generated-at metadata from the receivables ageing page because no API-generated metadata is available for this story. |

### UI Review Fix Validation Evidence — 2026-05-21

| Command | Log | Result |
|---------|-----|--------|
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/lib/report-export-helpers.test.ts` | `logs/story-69-3-f-ui-review-report-helpers-unit.log` | PASS — 12 tests. |
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/hooks/use-receivables-ageing.test.ts` | `logs/story-69-3-f-ui-review-receivables-unit.log` | PASS — 8 tests. |
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/lib/financial-report-routes.test.ts` | `logs/story-69-3-f-ui-review-financial-routes-unit-r2.log` | PASS — 4 tests. |
| `npm run lint -w @jurnapod/backoffice` | `logs/story-69-3-f-ui-review-backoffice-lint.log` | PASS — no ESLint findings logged. |
| `npm run typecheck -w @jurnapod/backoffice` | `logs/story-69-3-f-ui-review-backoffice-typecheck.log` | PASS — no TypeScript errors logged. |
| `npm run build -w @jurnapod/backoffice` | `logs/story-69-3-f-ui-review-backoffice-build.log` | PASS — production build completed; Vite emitted existing chunk-size/chunking warnings. |

### Final UI Review Follow-Up — 2026-05-21

| Item | Evidence |
|------|----------|
| UI review re-check | Task `ses_1b82594aaffe3NfruWoxWJRebq` returned **GO** after the UI review-fix batch. |
| Out-of-scope daily-sales permission regression | Resolved by restoring `/daily-sales` to legacy role-only route metadata; this avoids introducing `pos.transactions` ANALYZE gating outside Story 69-3-f. |
| Existing guard-suite alignment | Updated the stale audit-log guard expectation to canonical `platform.audit.READ`. |
| Breadcrumb cleanup | `/journals` breadcrumb label now reads `Journals`; `/trial-balance` and `/purchasing/ap-aging` breadcrumb labels were added. Final cleanup review returned **GO** with no P0/P1/P2/P3 findings. |

### Final Validation Evidence — 2026-05-21

| Command | Log | Result |
|---------|-----|--------|
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/app-router-guards-permissions.test.ts` | `logs/story-69-3-f-final-router-guards-unit-r2.log` | PASS — 77 tests. |
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/lib/financial-report-routes.test.ts` | `logs/story-69-3-f-final-financial-routes-unit-r3.log` | PASS — 4 tests. |
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/lib/report-export-helpers.test.ts` | `logs/story-69-3-f-final-report-helpers-unit.log` | PASS. |
| `npm run test:single -w @jurnapod/backoffice -- __test__/unit/hooks/use-receivables-ageing.test.ts` | `logs/story-69-3-f-final-receivables-unit.log` | PASS. |
| `npm run lint -w @jurnapod/backoffice` | `logs/story-69-3-f-final-backoffice-lint-r2.log` | PASS. |
| `npm run typecheck -w @jurnapod/backoffice` | `logs/story-69-3-f-final-backoffice-typecheck-r3.log` | PASS. |

### Architecture Follow-Up — 2026-05-21

| Item | Result |
|------|--------|
| UI implementation | **NO-GO** until report contracts and CSV/export scope are corrected or explicitly rescoped. |
| Contract-first work | **GO** after unfreeze. |
| CSV export | Contract work MUST either add verified report CSV endpoints or explicitly defer CSV export from this story. |
| AP aging | UI permission model MUST support `purchasing.reports` ANALYZE, or AP aging MUST be split into a purchasing-report slice. |
| AR aging | Backoffice assumptions MUST align to `/api/reports/receivables-ageing` and `customer_display_name`. |

## Fixture and Test Policy

- Report data fixtures MUST use canonical accounting/sales/purchasing package flows as applicable.
- Raw SQL setup is prohibited when canonical fixtures exist.
- Integration tests MUST use real DB and verify API/report boundaries.
- Unit tests MAY cover filter serialization, CSV filename logic, and table view-models.
- Date range logic MUST use Temporal/canonical helpers; native Date business logic and ISO string slicing are prohibited.
- Negative auth tests MUST use a low-privilege role lacking `accounting.reports` ANALYZE/READ.

## Required Validation Evidence with PID/Log Tracking

```bash
nohup npm run test:single -w @jurnapod/backoffice -- __test__/integration/accounting/financial-reports-export.test.ts > logs/story-69-3-f-reports-integration.log 2>&1 & echo $! > logs/story-69-3-f-reports-integration.pid
nohup npm run test:single -w @jurnapod/backoffice -- __test__/unit/accounting/financial-reports.test.ts > logs/story-69-3-f-reports-unit.log 2>&1 & echo $! > logs/story-69-3-f-reports-unit.pid
nohup npm run typecheck -w @jurnapod/backoffice > logs/story-69-3-f-backoffice-typecheck.log 2>&1 & echo $! > logs/story-69-3-f-backoffice-typecheck.pid
nohup npm run build -w @jurnapod/backoffice > logs/story-69-3-f-backoffice-build.log 2>&1 & echo $! > logs/story-69-3-f-backoffice-build.pid
```

## Tasks / Subtasks

- [x] Complete contract-first readiness fixes/rescope for endpoint paths, ACLs, and CSV/export behavior.
- [x] Implement trial balance page.
- [x] Implement general ledger page with verified pagination/filter behavior.
- [x] Implement AP aging and AR aging report pages.
- [x] Implement CSV export with `apiStreamingRequest()`.
- [x] Add API integration and focused route/helper tests for report load contracts, filters, export, and 403 behavior.
- [x] Add unit tests for filters, route metadata, date defaults, and export helpers.

## Story Done Authority

- Reviewer GO: `ses_1b82594aaffe3NfruWoxWJRebq` final cleanup review returned **GO** with no P0/P1/P2/P3 findings.
- Story owner sign-off: Ahmad wrote `sign-off` on 2026-05-21.
- Completion report: `story-69-3-f.completion.md`.
