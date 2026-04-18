# Story 43.2: Stock Outlet Validation + Invoice Update Schema

**Status:** done
**Priority:** P2

## Story

As a **platform engineer**,
I want **stock and invoice routes to validate outlet access correctly**,
So that **a user cannot access stock or invoice data for outlets they don't have permission to**.

## Context

Two production safety gaps exist in the API:

1. **`stock.ts`** (line 149): The `requireOutletAccess` middleware parses the `outletId` parameter but does not verify it belongs to the authenticated company. A malformed or malicious `outletId` could return data for another company's outlet.

2. **`sales/invoices.ts`** (line 305): Invoice updates use `SalesInvoiceUpdateRequestSchema` which is noted as TODO — the comment says "Create proper update schema". This needs a proper schema that validates only the fields that should be updatable on an existing invoice.

Additionally, this story applies the **E42-A1 rule**: "Require production impact review in infrastructure epic plans." Both fixes have production safety implications — improper outlet access could leak cross-tenant data.

---

## Acceptance Criteria

**AC1: stock.ts validates outlet belongs to company**
**Given** a request to `GET /stock` or `POST /stock/movements` with an `outletId`
**When** `requireOutletAccess` middleware runs
**Then** it verifies the outlet belongs to `auth.companyId` before proceeding
**And** returns 403 if the outlet is not associated with the company

**AC2: Invoice update uses schema for current mutable fields**
**Given** a `PATCH /sales/invoices/:id` request
**When** the request body is parsed
**Then** `SalesInvoiceUpdateRequestSchema` validates only fields that are currently mutable on an existing invoice: `outlet_id`, `invoice_no`, `invoice_date`, `due_date`, `due_term`, `tax_amount`, `lines`, `taxes`
**And** the schema is not a TODO placeholder

**AC3: No cross-tenant data leakage**
**Given** a user with access to outlet A but not outlet B
**When** the user requests stock data for outlet B
**Then** the request returns 403, not 200 with outlet B's data

---

## Technical Details

### Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/routes/stock.ts` | Add company-outlet association check in `requireOutletAccess` |
| `apps/api/src/routes/sales/invoices.ts` | Remove TODO comment; keep current `SalesInvoiceUpdateRequestSchema` as-is (schema already correct) |

### stock.ts Outlet Validation

```typescript
// Current (line 149): TODO comment only
// TODO: Add outlet validation against company's outlets if needed
// For now, we trust the auth context's companyId

// Fix: Use userHasOutletAccess() from auth.ts
const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, outletIdNum);
if (!hasAccess) {
  return c.json(
    { success: false, error: { code: 'FORBIDDEN', message: 'Outlet not accessible' } },
    403
  );
}
```

### SalesInvoiceUpdateRequestSchema

**Current:** Already defines the correct updateable fields matching the DB/service contract.

**Fields that are currently mutable (supported by Kysely schema + invoice-service):**
- `outlet_id` — reassign invoice to different outlet
- `invoice_no` — correct mis-typed invoice numbers
- `invoice_date` — fix date errors
- `due_date` — adjust payment terms
- `due_term` — change payment term duration
- `tax_amount` — manual tax adjustment
- `lines` — add/remove/update line items
- `taxes` — update tax lines

**Fields NOT YET supported (deferred to future customer-based invoicing story):**
- `customer_id` — future: link invoice to customer for AR aging
- `notes` — future: invoice-level remarks
- `discount_percent` / `discount_fixed` — future: invoice-level discounts
- `tax_override` — future: explicit tax override

### Deferred: Customer-Based Invoicing

The fields above (customer_id, notes, discounts, tax_override) are **out of scope** for this epic and belong in a future invoice-aging / AR story. They require:

1. **DB:** add `customer_id`, `notes`, discount fields to `sales_invoices`
2. **Service:** update `invoice-service.ts` update contract
3. **Schema:** update `SalesInvoiceUpdateRequestSchema` in shared package
4. **Tests:** integration tests for customer-linked invoice flows
5. **Reporting:** invoice aging reports using `customer_id`

---

## Test Coverage Criteria

- [x] Happy paths:
  - [x] Stock endpoint returns data for valid company-owned outlet
  - [x] Invoice update accepts valid update payload
- [x] Error paths:
  - [x] 403 returned when outletId belongs to another company
  - [x] 400 returned when update payload contains immutable fields
- [x] Focused auth tests (added as part of closeout):
  - [x] Focused stock 403 test: `apps/api/__test__/integration/stock/outlet-access.test.ts` — 2 tests passed
  - [x] Focused invoice PATCH test: `apps/api/__test__/integration/sales/invoices-update.test.ts` — 6 tests passed

---

## Test Fixtures

N/A — existing integration tests cover the routes.

---

## Tasks / Subtasks

- [x] Audit `stock.ts` `requireOutletAccess` middleware
- [x] Add `userHasOutletAccess()` validation in `requireOutletAccess`
- [x] Restore/confirm `SalesInvoiceUpdateRequestSchema` matches current invoice contract
- [x] Verify invoice update still works with valid payload
- [x] Verify `outlet_id` reassignment guard in both PATCH handlers
- [x] Add focused integration test: stock returns 403 for inaccessible outlet (`stock/outlet-access.test.ts`)
- [x] Add focused integration test: invoice PATCH with valid current fields (`sales/invoices-update.test.ts`)

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/stock.ts` | Modify | Add outlet-company validation in requireOutletAccess |
| `apps/api/src/routes/sales/invoices.ts` | Modify | Replace TODO with proper SalesInvoiceUpdateRequestSchema |

---

## Estimated Effort

2 hours

## Risk Level

Medium — production safety fix; wrong outlet validation could cause cross-tenant data leakage.

## Dev Notes

**Production impact (E42-A1):** This story fixes cross-tenant data leakage risk in stock routes. The outlet validation is a P2 because the current code trusts `auth.companyId` but doesn't verify the `outletId` parameter belongs to that company.

**Schema design:** Invoice updates should only allow mutable fields. See the schema definition in `packages/shared/` for the canonical create schema to derive the update schema from.

---

## Validation Evidence

```bash
# Lint and typecheck
npm run lint -w @jurnapod/api  # 2 pre-existing errors in sync-modules.ts (NOT this epic's scope)
npm run typecheck -w @jurnapod/api  # clean

# Full suite (2026-04-15): 135 files, 940 passed, 3 skipped
npm test -w @jurnapod/api

# Focused auth tests
# apps/api/__test__/integration/stock/outlet-access.test.ts — 2 tests passed
# apps/api/__test__/integration/sales/invoices-update.test.ts — 6 tests passed
```

---

## Dependencies

None

---

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] No `TODO`/`FIXME` comments left in production code
- [x] No `as any` casts added without justification
- [x] No deprecated functions used
- [x] No N+1 query patterns introduced
- [x] No in-memory state introduced
- [x] Integration tests included
