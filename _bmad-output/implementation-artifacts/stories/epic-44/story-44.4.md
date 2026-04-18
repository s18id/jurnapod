# Story 44.4: Receivables Ageing Reporting Completion

**Status:** planned
**Priority:** P1

## Story

As a **credit controller**,
I want **AR ageing report to show customer details, overdue flags, and drill‑down to invoice list**,
So that **I can monitor outstanding receivables per customer and take collection actions**.

## Context

The existing receivables-ageing runtime is already implemented under reports (`/reports/receivables-ageing`) and returns invoice-level rows. This story extends that canonical surface to include customer context, overdue flags, and customer drill-down behavior, while preserving compatibility with current backoffice consumers.

## Acceptance Criteria

**AC1: Receivables-ageing report joins customers**
**Given** the `/reports/receivables-ageing` endpoint
**When** it returns ageing rows
**Then** each row includes customer fields: `customer_id`, `customer_code`, `customer_type`, `customer_company_name` (or `customer_display_name`)
**And** rows without a customer (`customer_id` NULL) show NULL customer fields

**AC2: Overdue flag**
**Given** an invoice with `due_date` older than today
**When** the ageing report includes that invoice
**Then** the row has `overdue: true`
**And** invoices with `due_date` >= today have `overdue: false`

**AC3: Drill-down endpoint**
**Given** a customer ID and optional date range
**When** calling `GET /reports/receivables-ageing/customer/:customerId`
**Then** returns all invoices (with ageing bucket breakdown) for that customer
**And** respects the same ACL and outlet filters as the main ageing report

**AC4: Customer detail integration support**
**Given** the receivables-ageing UI
**When** a user clicks on a customer row
**Then** API contracts include data needed for customer-level drill-down
**And** UI routing implementation remains out of scope for this story

**AC5: ACL enforcement**
**Given** a user without `accounting.reports.ANALYZE` permission
**When** they call the ageing endpoints
**Then** they receive 403
**And** outlet filtering applies based on user's accessible outlets

**AC6: Integration tests**
**Given** the test suite
**When** `npm run test:integration -w @jurnapod/api` is executed
**Then** tests exist for:
- Ageing report includes customer fields
- Overdue flag correctly computed
- Drill‑down endpoint returns customer‑specific invoices
- ACL denial for missing permissions
**And** they pass

## Technical Details

### Files to Modify

| File | Change |
|------|--------|
| `packages/modules/reporting/src/reports/services.ts` | Update query to join `customers` table and add overdue flag |
| `apps/api/src/routes/reports.ts` | Add drill-down endpoint for customer-level receivables-ageing |
| `apps/backoffice/src/types/reports/receivables-ageing.ts` | Align customer fields/flags with API response |
| `apps/api/__test__/integration/reports/receivables-ageing*.test.ts` | Add/update integration tests |

### Query Changes

Current ageing query aggregates invoices by ageing bucket. Add LEFT JOIN `customers` on `sales_invoices.customer_id = customers.id` and include columns:
- `customers.code AS customer_code`
- `customers.type AS customer_type`
- `customers.company_name AS customer_company_name`
- `customers.tax_id AS customer_tax_id` (optional)

For rows where `customer_id` IS NULL, customer fields should be NULL.

### Overdue Flag

Compute in SQL: `due_date < CURDATE()` (MySQL) or in TypeScript after fetching. Preferably in SQL for efficiency.

### Drill-down Endpoint

- Path: `GET /reports/receivables-ageing/customer/:customerId`
- Accepts same query parameters as main ageing endpoint (`outlet_id`, `as_of_date`, etc.)
- Returns list of invoices (with bucket classification) for that customer only.
- Must verify that the customer belongs to the authenticated company (or outlet).

## Test Coverage Criteria

- [x] Ageing report includes customer fields (NULL for invoices without customer)
- [x] Overdue flag true when due_date < today
- [x] Drill‑down endpoint returns only invoices for specified customer
- [x] Drill‑down endpoint respects outlet filter
- [x] ACL denial for missing accounting.reports.ANALYZE permission
- [x] Existing backoffice receivables-ageing consumer remains compatible
- [x] All changes pass typecheck, lint, and tests

## Test Fixtures

- Create customers, invoices with varying due dates and amounts.
- Use existing ageing test fixtures.

## Tasks / Subtasks

- [ ] Update reporting receivables-ageing query to join customers
- [ ] Extend report response with customer fields and overdue flag
- [ ] Add overdue flag calculation (SQL or TypeScript)
- [ ] Add drill-down endpoint `/reports/receivables-ageing/customer/:customerId`
- [ ] Confirm backoffice type compatibility/update type mappings
- [ ] Create integration tests
- [ ] Run typecheck, lint, and tests

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/reporting/src/reports/services.ts` | Modify | Join customers, add overdue flag, keep bucket logic |
| `packages/modules/reporting/src/reports/types.ts` | Modify | Extend receivables-ageing response types |
| `apps/api/src/routes/reports.ts` | Modify | Add drill-down endpoint and ACL checks |
| `apps/backoffice/src/types/reports/receivables-ageing.ts` | Modify | Keep API consumer type compatibility |
| `apps/api/__test__/integration/reports/receivables-ageing*.test.ts` | Create/Modify | Integration tests |

## Estimated Effort

3 hours

## Risk Level

Medium — changes to existing ageing report; must ensure no regression in bucket calculations.

## Dev Notes

- Use LEFT JOIN to preserve invoices without customer.
- Overdue flag should use `as_of_date` as comparison reference when provided.
- Drill‑down endpoint should reuse the same ageing bucket logic (0‑30, 31‑60, etc.).
- Ensure all queries include `company_id` and outlet filter.
- Do not introduce a parallel treasury ageing route.

## Validation Evidence

```bash
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/api
npm run test:integration -w @jurnapod/api
```

## Dependencies

- 44.1 (Customer Master) — customers table must exist.
- 44.2 (Invoice → Customer Link) — invoices must have customer_id.

## Technical Debt Review

- [ ] No shortcuts taken that require follow‑up
- [ ] No `TODO`/`FIXME` comments left in production code
- [ ] No `as any` casts added without justification
- [ ] No deprecated functions used
- [ ] No N+1 query patterns introduced
- [ ] No in‑memory state introduced
- [ ] Integration tests included

## ADR References

- [ADR-0022: AR Transaction Model](../../../../docs/adr/adr-0022-ar-transaction-model.md)
