# Story 69-3-f: Financial Reports + CSV Export

Status: backlog

## Readiness Status

- 2026-05-20 architecture readiness review: **NO-GO for implementation as written**.
- Coordination record: `story-69-3-f.readiness-coordination.md`.
- Primary reason: endpoint paths and ACL assumptions in this story do not match actual routes, and required CSV export contracts are not verified for trial balance, general ledger, AP aging, or receivables aging.
- Backoffice implementation MUST NOT start until Ahmad explicitly records Story 69-3-f unfreeze.

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

- [ ] Explicit unfreeze authorization recorded by story owner for Story 69-3-f.
- [ ] Authorization scope includes financial report screens, exports, and tests.
- [ ] If authorization is absent, implementation MUST NOT start.

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
| `/api/reports/trial-balance` | GET | Query params, row schema, totals, date handling, error shape | TBD |
| `/api/reports/general-ledger` | GET | Query params, pagination, row schema, totals/running balance fields | TBD |
| `/api/reports/ap-aging` | GET | Query params, bucket schema, totals | TBD |
| `/api/reports/ar-aging` | GET | Query params, bucket schema, totals | TBD |
| Report CSV endpoint(s) | GET | CSV headers, content type, auth, error response, streaming client compatibility | TBD |

### Readiness Findings — 2026-05-20

| Contract Item | Result |
|---------------|--------|
| Trial balance | Actual endpoint is `GET /api/reports/trial-balance`; no verified CSV export endpoint. |
| General ledger | Actual endpoint is `GET /api/reports/general-ledger`; pagination is implicit via `line_limit`/`line_offset` and response lacks explicit pagination envelope; no verified CSV export endpoint. |
| AP aging | Actual endpoint is `GET /api/purchasing/reports/ap-aging`; ACL is `purchasing.reports` ANALYZE, not `accounting.reports`. |
| AR aging | Actual endpoint is `GET /api/reports/receivables-ageing`, not `/api/reports/ar-aging`; current client assumptions require contract alignment. |
| CSV export | No verified CSV endpoints exist for this story's required reports. Generic export supports inventory items/prices only; AP reconciliation export is unrelated. |
| Route permissions | Story-level permission model must be split between `accounting.reports` and `purchasing.reports` unless AP aging is removed from this slice. |

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

- [ ] Implement trial balance page.
- [ ] Implement general ledger page with verified pagination/filter behavior.
- [ ] Implement AP aging and AR aging report pages.
- [ ] Implement CSV export with `apiStreamingRequest()`.
- [ ] Add integration tests for report load, filters, export, and 403.
- [ ] Add unit tests for filters, table view-models, and export helpers.

## Story Done Authority

The implementing developer MUST NOT mark this story done. Done requires reviewer GO, story owner explicit sign-off, and `story-69-3-f.completion.md` with evidence.
