# Story 69-3-f Readiness Coordination — Financial Reports + CSV Export

Date: 2026-05-20

## Decision

**NO-GO for Story 69-3-f implementation as currently written.**

The story endpoint table does not match actual API routes for AP/AR aging, CSV export endpoints are not verified for the required reports, typed API contract coverage is incomplete, AP aging uses `purchasing.reports` rather than `accounting.reports`, and backoffice implementation MUST NOT proceed until Ahmad explicitly unfreezes `apps/backoffice` for Story 69-3-f.

## Contract Facts Discovered

| Report | Actual Endpoint | Query | ACL | Response Facts | CSV |
|--------|-----------------|-------|-----|----------------|-----|
| Trial balance | `GET /api/reports/trial-balance` | `outlet_id`, `date_from`, `date_to`, `as_of` | `accounting.reports` ANALYZE | `filters`, `totals.total_debit`, `totals.total_credit`, `totals.balance`, `rows[]` | No verified CSV endpoint |
| General ledger | `GET /api/reports/general-ledger` | `outlet_id`, `date_from`, `date_to`, `account_id`, `line_limit`, `line_offset` | `accounting.reports` ANALYZE | `filters`, `rows[]`; no explicit pagination envelope | No verified CSV endpoint |
| AP aging | `GET /api/purchasing/reports/ap-aging` | `as_of_date` | `purchasing.reports` ANALYZE | `as_of_date`, `suppliers[]`, `grand_totals`; amounts are string values | No verified CSV endpoint |
| AR / receivables aging | `GET /api/reports/receivables-ageing` | `outlet_id`, `as_of_date` | `accounting.reports` ANALYZE | `filters`, `buckets`, `total_outstanding`, `invoices[]`; customer display field is `customer_display_name` | No verified CSV endpoint |
| Generic export | `POST /api/export/{items|prices}` | Inventory export filters | `inventory.items` READ | File response for items/prices only | Not usable for financial reports |
| AP reconciliation export | `GET /api/purchasing/reports/ap-reconciliation/export` | `as_of_date`, `format` | `purchasing.reports` ANALYZE | `text/csv` attachment | Pattern only; unrelated report |

## Blockers

| Severity | Blocker | Evidence |
|----------|---------|----------|
| P1 | Backoffice implementation is frozen until explicit Story 69-3-f unfreeze is recorded. | `story-69-3-f.md` Backoffice Unfreeze Gate remains unchecked. |
| P1 | Story endpoint table is wrong for AP aging and AR aging. | Story expects `/api/reports/ap-aging` and `/api/reports/ar-aging`; actual routes are `/api/purchasing/reports/ap-aging` and `/api/reports/receivables-ageing`. |
| P1 | No verified CSV export endpoint exists for trial balance, general ledger, AP aging, or AR aging. | Existing generic export supports inventory items/prices; AP reconciliation export is unrelated. |
| P1 | Permission model is inconsistent for AP aging. | Story expects `accounting.reports`; AP aging requires `purchasing.reports`. |
| P1 | Typed/generated API contract coverage is incomplete for required report pages. | Generated schema has incomplete coverage and weak typing for relevant report paths. |
| P1 | Existing AR page assumptions do not fully match API response/query contract. | Existing client code uses `customer_id` query and `customer_name`; API summary route parses only `outlet_id`/`as_of_date` and returns `customer_display_name`. |
| P1 | AR CSV export is currently client-generated, not canonical streaming client. | Story AC4 requires `apiStreamingRequest()` or verified equivalent streaming path. |
| P2 | General ledger pagination is partial/implicit. | API accepts `line_limit`/`line_offset` but does not return explicit `pagination.total`/`has_more`. |
| P2 | Report navigation metadata remains role-based in areas relevant to this story. | Report route metadata lacks resource-level permission requirements. |

## Recommended Rescope

1. **69-3-f-api-contract-readiness** — Fix endpoint table to actual endpoints, define ACL per report, add/verify OpenAPI and generated types for trial balance, general ledger, AP aging, and receivables aging.
2. **69-3-f-report-csv-api** — Add verified CSV export endpoints or explicitly defer export. Contract MUST define path, method, content type, auth, filename, and error shape.
3. **69-3-f-backoffice-pages** — Implement pages only after Ahmad explicitly unfreezes Story 69-3-f and report contracts are verified.
4. **AP aging split** — Split AP aging into a purchasing-report slice if it remains governed by `purchasing.reports`.

## Backoffice Freeze Result

Backoffice implementation for Story 69-3-f MUST NOT start without explicit Ahmad unfreeze authorization for this child story.

## Reviewer

- Architecture readiness review task: `ses_1bc45e6b8fferJ9TCoJotn2qtY`
