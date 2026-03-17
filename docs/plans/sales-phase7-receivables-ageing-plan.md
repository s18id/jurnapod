<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Sales Phase 7 Plan - Receivables Ageing with Due Date

Status: Planned (Approved defaults)

This document is the implementation specification for Sales Enhancement Roadmap Phase 7. It introduces receivables ageing based on invoice due dates while preserving backward compatibility for legacy invoices.

## Objectives

- Deliver a reliable receivables ageing report for finance and accounting users.
- Use due date as the business-correct ageing basis.
- Keep report logic tenant-safe, outlet-safe, and deterministic as of a selected date.
- Avoid breaking existing invoice create/update/read contracts.

---

## Locked Decisions

1. Add `sales_invoices.due_date` as nullable.
2. Ageing basis is `COALESCE(due_date, invoice_date)`.
3. New invoice default: when `due_date` is omitted, auto-calculate `due_date = invoice_date + 30 days` (Net 30).
4. Supported auto-calculation term options include common defaults: Net 0, Net 7, Net 14, Net 15, Net 20, Net 30, Net 45, Net 60, and Net 90.
5. No destructive historical backfill for old invoices.

These decisions are final for Phase 7 scope.

---

## Business Rules

### Source of truth

- Sales outstanding comes from posted sales invoices in `sales_invoices`.
- Outstanding amount is `grand_total - paid_total`.
- Only invoices with positive outstanding are included.

### Ageing basis

- Primary date: `due_date`.
- Fallback date: `invoice_date` when `due_date` is null.
- Age is calculated against `as_of_date` supplied in query (or default current date).

### Due-date default policy

- Default credit term for this phase is Net 30.
- Supported auto-calculation options are:
  - `NET_0` (due on invoice date)
  - `NET_7`
  - `NET_14`
  - `NET_15`
  - `NET_20`
  - `NET_30` (default)
  - `NET_45`
  - `NET_60`
  - `NET_90`
- If create payload omits `due_date`, set it to `invoice_date + INTERVAL 30 DAY` by default.
- If an explicit term option is provided, use that term for auto-calculation.
- If payload provides `due_date`, use the explicit value and skip auto-calculation.
- If term option is invalid, return `INVALID_REQUEST` (400).

### Bucket semantics

- `current`: not yet due (`days_overdue <= 0`)
- `1_30_days`: overdue 1-30 days
- `31_60_days`: overdue 31-60 days
- `61_90_days`: overdue 61-90 days
- `over_90_days`: overdue 91+ days

### Inclusion filters

- `company_id` must match authenticated company.
- `status` must be `POSTED`.
- `grand_total - paid_total > 0`.
- Outlet scope must follow user access and optional `outlet_id` filter.

---

## Scope

In scope:
- Schema extension for invoice `due_date`.
- Shared schema contract extension for invoice create/update/read.
- Receivables ageing report endpoint under `/api/reports`.
- JSON and CSV output formats.
- Integration tests for correctness and access control.

Out of scope:
- Payment term catalog and per-customer policy engine.
- UI implementation in web app.
- Historical due-date enrichment for existing invoices.
- Excel binary export format (CSV is sufficient for Phase 7).

---

## API Specification

### Endpoint

- `GET /api/reports/receivables-ageing`

### Query parameters

- `outlet_id` optional, positive integer.
- `as_of_date` optional, format `YYYY-MM-DD`.
- `format` optional, enum `json | csv`, default `json`.

### Access control

- Guard: `requireAccessForOutletQuery({ roles, module: "reports", permission: "read" })`.
- Allowed roles: `OWNER`, `COMPANY_ADMIN`, `ADMIN`, `ACCOUNTANT`.
- Cashier is denied, consistent with accounting report endpoints.

### JSON response

```json
{
  "filters": {
    "outlet_ids": [1],
    "as_of_date": "2026-03-09"
  },
  "buckets": {
    "current": 5000000,
    "1_30_days": 2000000,
    "31_60_days": 1000000,
    "61_90_days": 500000,
    "over_90_days": 0
  },
  "total_outstanding": 8500000,
  "invoices": [
    {
      "invoice_id": 1001,
      "invoice_no": "INV/2603/0001",
      "outlet_id": 1,
      "outlet_name": "Main Outlet",
      "invoice_date": "2026-03-01",
      "due_date": "2026-03-08",
      "days_overdue": 1,
      "outstanding_amount": 5000000,
      "age_bucket": "1_30_days"
    }
  ]
}
```

### CSV response

- Content type: `text/csv; charset=utf-8`
- Header set includes `Content-Disposition` attachment filename with `as_of_date`.
- Recommended columns:
  - `invoice_no`
  - `invoice_date`
  - `due_date`
  - `outlet_id`
  - `outlet_name`
  - `days_overdue`
  - `age_bucket`
  - `outstanding_amount`

---

## Data Model Changes

### New invoice column

- Table: `sales_invoices`
- Column: `due_date DATE NULL`

Rationale:
- Nullable keeps migration backward compatible.
- Report fallback preserves behavior for historical rows.

### Indexing

- Add guarded index for report scan path:
  - `(company_id, status, payment_status, due_date, outlet_id)`

Notes:
- Query still computes outstanding from expression, so index mainly reduces tenant/status/date scan cost.
- Existing indexes remain untouched.

---

## Migration Design (MySQL + MariaDB)

### File

- New migration file in `packages/db/migrations/` with next sequence number.

### Idempotent DDL pattern

- Use `information_schema.COLUMNS` check before adding `due_date`.
- Use `information_schema.STATISTICS` check before creating index.
- Execute via guarded dynamic SQL (`PREPARE`/`EXECUTE`) to stay rerunnable.

### Safety constraints

- Additive only, no destructive operations.
- No `ALTER ... IF NOT EXISTS` shortcuts that are version-dependent.
- Re-run safe in partial deployment scenarios.

---

## Contract Updates

Update `packages/shared/src/schemas/sales.ts`:

- `SalesInvoiceCreateRequestSchema`
  - add optional `due_date` (`YYYY-MM-DD`).
- `SalesInvoiceUpdateRequestSchema`
  - add optional `due_date`.
- `SalesInvoiceSchema`
  - add nullable optional `due_date`.

Compatibility:
- Existing clients that do not send `due_date` continue working.
- Existing readers tolerate `due_date: null` for historical records.

---

## Sales Domain Changes

Update `apps/api/src/lib/sales.ts`:

- Invoice create flow:
  - include `due_date` in insert columns.
  - if omitted, auto-calculate from default term (Net 30).
- Invoice update flow (DRAFT only):
  - allow updating `due_date`.
- Invoice read/list/detail queries:
  - include `due_date` in select projection.
  - normalize `due_date` as date string or null in response mappers.

Invariant:
- No change to posting state machine or payment status transitions.

---

## Report Engine Design

Update `apps/api/src/lib/reports.ts` with a dedicated function, for example:

```ts
getReceivablesAgeingReport(filter: {
  companyId: number;
  outletIds: readonly number[];
  asOfDate: string;
})
```

### SQL shape (illustrative)

```sql
SELECT
  i.id AS invoice_id,
  i.invoice_no,
  i.outlet_id,
  o.name AS outlet_name,
  i.invoice_date,
  i.due_date,
  (i.grand_total - i.paid_total) AS outstanding_amount,
  DATEDIFF(?, COALESCE(i.due_date, i.invoice_date)) AS days_overdue
FROM sales_invoices i
LEFT JOIN outlets o ON o.id = i.outlet_id
WHERE i.company_id = ?
  AND i.status = 'POSTED'
  AND (i.grand_total - i.paid_total) > 0
  AND i.outlet_id IN (...)
ORDER BY days_overdue DESC, i.invoice_date ASC, i.id ASC
```

### Mapping and aggregation

- Determine `age_bucket` in TypeScript from `days_overdue`.
- Aggregate bucket totals in memory.
- Compute `total_outstanding` as sum of all invoice outstanding amounts.
- Validate internal invariant: sum of bucket totals equals `total_outstanding`.

---

## Route Design

Add `apps/api/app/api/reports/receivables-ageing/route.ts`.

### Parsing and validation

- Zod query schema for `outlet_id`, `as_of_date`, `format`.
- Default `as_of_date` to current date in `YYYY-MM-DD`.
- Return `INVALID_REQUEST` (400) for malformed query values.

### Auth and outlet scoping

- Use existing reports guard pattern.
- If `outlet_id` present, verify explicit outlet access.
- If absent, resolve outlet list from user assignment.
- If user has no outlets, return empty data set with zero totals.

### Response behavior

- `format=json`: return standard `successResponse` payload.
- `format=csv`: return streamed/plain CSV body with report rows.
- Failures return same error style as existing reports routes.

---

## Time and Date Semantics

- `invoice_date` and `due_date` are SQL `DATE`, timezone-neutral.
- `as_of_date` is treated as local business date string, not datetime.
- `DATEDIFF(as_of_date, base_date)` avoids timezone drift from datetime conversion.
- Journal posting `line_date` must use business document date (`invoice_date`) as `DATE`, not server runtime UTC date.
- `current` includes not-due and due-today invoices.

---

## Edge Cases

1. `due_date` null on historical rows:
   - Use `invoice_date` fallback.
2. Overpaid or zero-outstanding invoices:
   - Excluded by `(grand_total - paid_total) > 0`.
3. Negative `days_overdue`:
   - Classified as `current`.
4. Empty outlet scope for user:
   - Return zero buckets and empty invoice list.
5. Outlet deleted/name missing:
   - Keep `outlet_id`, allow nullable `outlet_name`.

---

## Performance Considerations

- Composite index reduces scan for tenant + posted + payment-status + due-date patterns.
- Query avoids join-heavy structures and reads from `sales_invoices` as primary source.
- Sorting by overdue and invoice identifiers is deterministic for CSV exports.
- Phase 7 target scale: low complexity, acceptable for near-term AR usage.

---

## Testing Plan

### New integration file

- `apps/api/tests/integration/reports.receivables-ageing.integration.test.mjs`

### Required test scenarios

1. Bucket mapping correctness across all five buckets.
2. `due_date` fallback path (`due_date = null` uses `invoice_date`).
3. Inclusion rules (`POSTED` + outstanding only).
4. Outlet filter behavior and cross-outlet exclusion.
5. ACL checks for allowed and denied roles.
6. CSV response headers and row content.
7. Totals invariant (`sum(buckets) === total_outstanding`).

### Existing test updates

- Extend `apps/api/tests/integration/reports.access.integration.test.mjs`:
  - include `/api/reports/receivables-ageing` in role access matrix.

---

## Acceptance Criteria

- `sales_invoices` has nullable `due_date` and migration is rerunnable.
- Invoice API accepts and returns `due_date` without breaking existing clients.
- New invoices persist Net 30 due date by default when `due_date` is omitted.
- New invoices can use any supported common net term when selected in term options.
- Receivables ageing endpoint returns correct buckets and details.
- CSV format works for export use cases.
- Access control and tenant/outlet scoping are enforced.
- Integration tests covering logic and ACL pass.

---

## Rollout and Verification

1. Apply migration in staging.
2. Deploy API with schema and route changes.
3. Run integration test suite for reports and sales.
4. Validate pilot output against manual AR sample from posted invoices.
5. Release to production.

Operational checks post-release:
- Monitor endpoint latency and DB load.
- Validate finance feedback on bucket correctness.
- Confirm no unauthorized access in logs.

---

## Follow-up Candidates (Post Phase 7)

- Configurable company-level or customer-level payment terms policy.
- Customer-specific default terms.
- Dedicated AR summary endpoints (customer-wise ageing).
- UI report screen and downloadable exports from web app.
