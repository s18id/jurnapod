# Story 69-3-f Readiness Coordination — Financial Reports + CSV Export

Date: 2026-05-20

## Decision

**NO-GO for Story 69-3-f implementation as currently written.**

The story endpoint table does not match actual API routes for AP/AR aging, CSV export endpoints are not verified for the required reports, typed API contract coverage is incomplete, AP aging uses `purchasing.reports` rather than `accounting.reports`, and backoffice implementation MUST NOT proceed until Ahmad explicitly unfreezes `apps/backoffice` for Story 69-3-f.

## Unfreeze Update — 2026-05-21

Ahmad wrote `unfreeze` for Story 69-3-f on 2026-05-21. This resolves the backoffice freeze blocker for this child story and authorizes contract-first readiness work. It does not resolve endpoint, ACL, typed-contract, or CSV/export blockers. Backoffice UI implementation MUST wait until those blockers are corrected or explicitly rescoped and reviewed.

## Architecture Follow-Up — 2026-05-21

- **Task**: `ses_1b85fb25affeD1gVTsSe3oqDAH`
- **Decision**: NO-GO for UI implementation; GO only for contract-first readiness/rescope work.
- **Smallest safe path**: JSON report contract readiness first; UI after contract GO; CSV export endpoints MUST be added before export UI, or CSV export MUST be explicitly deferred from this story.

## Contract Facts Discovered

| Report | Actual Endpoint | Query | ACL | Response Facts | CSV |
|--------|-----------------|-------|-----|----------------|-----|
| Trial balance | `GET /api/reports/trial-balance` | `outlet_id`, `date_from`, `date_to`, `as_of` | `accounting.reports` ANALYZE | `filters`, `totals.total_debit`, `totals.total_credit`, `totals.balance`, `rows[]` | `GET /api/reports/trial-balance/export?format=csv` |
| General ledger | `GET /api/reports/general-ledger` | `outlet_id`, `date_from`, `date_to`, `account_id`, `line_limit`, `line_offset` | `accounting.reports` ANALYZE | `filters`, `rows[]`; no explicit pagination envelope | `GET /api/reports/general-ledger/export?format=csv` |
| AP aging | `GET /api/purchasing/reports/ap-aging` | `as_of_date` | `purchasing.reports` ANALYZE | `as_of_date`, `suppliers[]`, `grand_totals`; amounts are string values | `GET /api/purchasing/reports/ap-aging/export?format=csv` |
| AR / receivables aging | `GET /api/reports/receivables-ageing` | `outlet_id`, `as_of_date` | `accounting.reports` ANALYZE | `filters`, `buckets`, `total_outstanding`, `invoices[]`; customer display field is `customer_display_name` | `GET /api/reports/receivables-ageing/export?format=csv` |
| Generic export | `POST /api/export/{items|prices}` | Inventory export filters | `inventory.items` READ | File response for items/prices only | Not usable for financial reports |
| AP reconciliation export | `GET /api/purchasing/reports/ap-reconciliation/export` | `as_of_date`, `format` | `purchasing.reports` ANALYZE | `text/csv` attachment | Pattern only; unrelated report |

## Contract-First Fix Update — 2026-05-21

| Report | JSON Endpoint | CSV Endpoint | ACL | Contract Result |
|--------|---------------|--------------|-----|-----------------|
| Trial balance | `GET /api/reports/trial-balance` | `GET /api/reports/trial-balance/export?format=csv` | `accounting.reports` ANALYZE | CSV returns `text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="trial-balance-{date}.csv"`. |
| General ledger | `GET /api/reports/general-ledger` | `GET /api/reports/general-ledger/export?format=csv` | `accounting.reports` ANALYZE | CSV returns `text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="general-ledger-{date}.csv"`; JSON pagination remains implicit via `line_limit`/`line_offset`. |
| AP aging | `GET /api/purchasing/reports/ap-aging` | `GET /api/purchasing/reports/ap-aging/export?format=csv` | `purchasing.reports` ANALYZE | CSV returns `text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="ap-aging-{as_of_date}.csv"`. |
| AR / receivables aging | `GET /api/reports/receivables-ageing` | `GET /api/reports/receivables-ageing/export?format=csv` | `accounting.reports` ANALYZE | CSV returns `text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="receivables-ageing-{as_of_date}.csv"`; API field is `customer_display_name`; supported query is `outlet_id`/`as_of_date`. |

Backoffice contract alignment in this batch is limited to existing AR/receivables ageing helpers and navigation metadata. Full report UI implementation remains gated by review and is not marked done.

## Independent Review Follow-Up — 2026-05-21

- Review task `ses_1b8476fd7ffeUSnPoGMkp0caml` returned **NO-GO** for the initial contract-first batch.
- Required fixes completed in the follow-up batch:
  - CSV export integration coverage now seeds posted accounting/AP/AR report data through canonical fixtures and production package/API flows.
  - Trial balance and general ledger CSV assertions now verify posted manual journal account rows, totals row presence, and general-ledger line content.
  - Receivables ageing CSV/JSON assertions now verify `customer_display_name`, bucket totals, report total, and outlet scoping.
  - AP ageing CSV assertions now verify supplier bucket values and grand totals.
  - AR export UX now surfaces 401/403/500/network failures as user-visible text instead of only throwing a generic error.
  - CSV serialization now hardens formula-leading text cells while preserving numeric amount strings.
  - Accounting CSV OpenAPI export entries now document 400/401/403/500 responses.
- Deterministic fallback note: when `as_of_date` is omitted for AP/AR export routes, the export routes intentionally match existing JSON route behavior and use current UTC date via `fromUtcIso.dateOnly(nowUTC())`. Backoffice export callers pass explicit `as_of_date`.
- Ahmad reported review task `ses_1b8476fd7ffeUSnPoGMkp0caml` returned **GO** after the review-fix batch.

## Backoffice UI Implementation Update — 2026-05-21

- Trial balance route/page added at `/trial-balance` with outlet/fiscal-year/date filters, totals, rows, and streaming CSV export.
- General ledger page now builds report/export paths from centralized helpers and exposes streaming CSV export while preserving implicit `line_limit`/`line_offset` pagination.
- AP ageing route/page added at `/purchasing/ap-aging` with `purchasing.reports` ANALYZE metadata, summary buckets, currency totals, and streaming CSV export.
- Receivables ageing route rendering now maps `/receivables-ageing` to the existing contract-aligned AR page/export UI.
- Report export helpers centralize CSV path building, filename extraction, visible export error messages, and canonical date defaults.
- Cleanup pass removed the unused legacy `JournalsPage` export from `reports-pages.tsx`; the active journal CRUD/void page remains `features/journals-page.tsx`.
- Focused validation evidence:
  - `logs/story-69-3-f-backoffice-report-helpers-unit.log` — PASS, 8 tests.
  - `logs/story-69-3-f-backoffice-ui-typecheck-r2.log` — PASS, no TypeScript errors logged.
  - `logs/story-69-3-f-backoffice-ui-lint-r2.log` — PASS, no ESLint findings logged.
  - `logs/story-69-3-f-backoffice-ui-build-r2.log` — PASS, Vite build completed with existing chunk-size/chunking warnings.
- Story remains **in progress**. It is not marked done and still requires final review plus story owner sign-off.

## UI Review Fix Update — 2026-05-21

- Review task `ses_1b82594aaffe3NfruWoxWJRebq` returned **NO-GO** for the first backoffice UI batch.
- Required fixes completed:
  - Added focused route metadata/render-wiring tests for trial balance, general ledger, AP ageing, and receivables ageing routes.
  - Expanded export helper tests for streaming request paths, server filenames, 401/403/500 visible errors, network errors, and general-ledger `line_limit`/`line_offset`-only pagination behavior.
  - AR ageing filters now use controlled `value`/`onChange` inputs tied to parent filter state.
  - AR export now remains enabled for zero-row report objects so auditable empty reports can be exported.
  - `/journals` label now reads `Journals`; trial balance is separated under `/trial-balance`.
  - Client-generated receivables ageing `Generated at: new Date()` metadata was removed because API metadata is unavailable in this story.
- Focused validation evidence:
  - `logs/story-69-3-f-ui-review-report-helpers-unit.log` — PASS, 12 tests.
  - `logs/story-69-3-f-ui-review-receivables-unit.log` — PASS, 8 tests.
  - `logs/story-69-3-f-ui-review-financial-routes-unit-r2.log` — PASS, 4 tests.
  - `logs/story-69-3-f-ui-review-backoffice-lint.log` — PASS, no ESLint findings logged.
  - `logs/story-69-3-f-ui-review-backoffice-typecheck.log` — PASS, no TypeScript errors logged.
  - `logs/story-69-3-f-ui-review-backoffice-build.log` — PASS, Vite build completed with existing chunk-size/chunking warnings.
- Story remains **in progress**. It is not marked done and sprint status was not updated to done.

## Final UI Review Follow-Up — 2026-05-21

- Re-review task `ses_1b82594aaffe3NfruWoxWJRebq` returned **NO-GO** for one out-of-scope regression: `/daily-sales` had acquired `pos.transactions` ANALYZE permission metadata outside this story.
- Follow-up fix restored `/daily-sales` to legacy role-only route metadata and aligned the existing guard-suite audit-log expectation to canonical `platform.audit.READ`.
- Focused validation evidence:
  - `logs/story-69-3-f-final-router-guards-unit-r2.log` — PASS, 77 tests.
  - `logs/story-69-3-f-final-financial-routes-unit-r3.log` — PASS, 4 tests.
  - `logs/story-69-3-f-final-backoffice-lint-r2.log` — PASS.
  - `logs/story-69-3-f-final-backoffice-typecheck-r3.log` — PASS.
- Optional breadcrumb cleanup was completed: `/journals` breadcrumb label now reads `Journals`, and `/trial-balance` plus `/purchasing/ap-aging` breadcrumb labels were added.
- Final cleanup review returned **GO** with no P0/P1/P2/P3 findings.
- Ahmad wrote `sign-off` on 2026-05-21. Story completion report was created at `story-69-3-f.completion.md`. Sprint status is eligible for canonical done update.

## Blockers

| Severity | Blocker | Evidence |
|----------|---------|----------|
| P1 | Backoffice implementation is frozen until explicit Story 69-3-f unfreeze is recorded. | ✅ Resolved — Ahmad wrote `unfreeze` on 2026-05-21; contract-first readiness still required before UI implementation. |
| P1 | Story endpoint table is wrong for AP aging and AR aging. | Story expects `/api/reports/ap-aging` and `/api/reports/ar-aging`; actual routes are `/api/purchasing/reports/ap-aging` and `/api/reports/receivables-ageing`. |
| P1 | No verified CSV export endpoint exists for trial balance, general ledger, AP aging, or AR aging. | ✅ Resolved in contract-first batch with report-specific CSV endpoints listed above; follow-up tests now verify seeded report correctness. |
| P1 | Permission model is inconsistent for AP aging. | ✅ Resolved for implemented UI — AP ageing route metadata uses `purchasing.reports` ANALYZE. |
| P1 | Typed/generated API contract coverage is incomplete for required report pages. | OpenAPI route schemas were strengthened for trial balance, general ledger, receivables ageing, and AP aging CSV. Generated backoffice schema refresh remains a follow-up if a codegen workflow is introduced. |
| P1 | Existing AR page assumptions do not fully match API response/query contract. | ✅ Contract helper alignment completed: query uses `outlet_id`/`as_of_date`, and aggregation uses `customer_display_name`. |
| P1 | AR CSV export is currently client-generated, not canonical streaming client. | ✅ Existing AR export button now calls the verified streaming endpoint via `apiStreamingRequest()`. |
| P2 | General ledger pagination is partial/implicit. | API accepts `line_limit`/`line_offset` but does not return explicit `pagination.total`/`has_more`. |
| P2 | Report navigation metadata remains role-based in areas relevant to this story. | ✅ Accounting/financial report navigation entries now include resource-level permission metadata; AP ageing uses purchasing report metadata. |
| P2 | AP/AR omitted date fallback uses UTC current date. | Documented deterministic fallback; backoffice export callers pass explicit `as_of_date`. |
| P1 | UI/report route and export helper coverage missing. | ✅ Resolved in UI review-fix batch with focused route metadata/render-wiring/export helper tests. |
| P2 | AR filters were uncontrolled. | ✅ Resolved; filters are controlled by parent state. |
| P2 | AR zero-row exports were disabled. | ✅ Resolved; report object presence enables export. |

## Recommended Rescope

1. **69-3-f-api-contract-readiness** — Fix endpoint table to actual endpoints, define ACL per report, add/verify OpenAPI and generated types for trial balance, general ledger, AP aging, and receivables aging.
2. **69-3-f-report-csv-api** — Add verified CSV export endpoints or explicitly defer export. Contract MUST define path, method, content type, auth, filename, and error shape.
3. **69-3-f-backoffice-pages** — Implement pages only after Ahmad explicitly unfreezes Story 69-3-f and report contracts are verified.
4. **AP aging split** — Split AP aging into a purchasing-report slice if it remains governed by `purchasing.reports`.

## Contract-First Next Batches

1. **API/package report contract readiness** — Define and verify schemas for trial balance, general ledger, AP aging, and receivables aging; align endpoint paths and ACLs.
2. **CSV/export scope decision** — Either implement verified CSV endpoints for all required reports or explicitly defer CSV export to a separate story.
3. **Backoffice route/typed-client readiness** — Align hooks/types/routes with verified contracts and resource-level route permissions.
4. **Backoffice UI implementation** — Start only after contract readiness receives reviewer GO.

## Backoffice Freeze Result

Backoffice unfreeze authorization is recorded. Endpoint, ACL, typed-contract, and CSV/export blockers were corrected or explicitly documented before the UI batch proceeded. Final review GO and Ahmad owner sign-off are recorded.

## Reviewer

- Architecture readiness review task: `ses_1bc45e6b8fferJ9TCoJotn2qtY`
