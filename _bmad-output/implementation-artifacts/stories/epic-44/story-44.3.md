# Story 44.3: Invoice Header Discounts Alignment

**Status:** planned
**Priority:** P1

## Story

As a **sales user**,
I want **to apply invoice‑level discounts (percent and fixed amount) before tax**,
So that **I can offer overall discounts on an invoice while maintaining correct tax calculations**.

## Context

Epic 44 initially assumed invoice discount columns were missing. Current schema evidence indicates discount fields may already exist in `sales_invoices`. This story focuses on behavior/contract alignment and regression safety:

- confirm schema presence (or apply guarded idempotent migration fallback if absent)
- enforce validation and calculation invariants
- align shared schemas, API behavior, and integration tests

## Acceptance Criteria

**AC1: Confirm discount schema baseline**
**Given** current database schema
**When** schema inspection is performed
**Then** `sales_invoices` includes `discount_percent` and `discount_fixed`
**And** if missing in any target environment, a guarded idempotent migration is used as fallback.

**AC2: Update invoice create/update schemas**
**Given** the shared Zod contracts
**When** a developer inspects `SalesInvoiceCreateRequestSchema` and `SalesInvoiceUpdateRequestSchema`
**Then** they include optional `discount_percent` and `discount_fixed` fields (nullable numbers)
**And** validation ensures `discount_percent` ∈ [0,100] and `discount_fixed` ≥ 0

**AC3: Discount validation logic**
**Given** an invoice with subtotal = X
**When** discount_percent = P and discount_fixed = F are provided
**Then** the system rejects the invoice if `(X * P/100) + F > X` (i.e., total discount exceeds subtotal)
**And** returns a 400 error with clear message

**AC4: Taxable amount calculation**
**Given** subtotal X, discount_percent P, discount_fixed F
**When** taxable amount is computed
**Then** taxable = X - (X * P/100) - F
**And** tax_amount = taxable * tax_rate (or sum of line taxes)
**And** grand_total = taxable + tax_amount

**AC5: Integration tests**
**Given** the test suite
**When** `npm run test:integration -w @jurnapod/api` is executed
**Then** tests exist for:
- Invoice with only discount_percent
- Invoice with only discount_fixed
- Invoice with both discounts
- Rejection when discount > subtotal
- Correct tax and grand total calculations
**And** they pass

## Technical Details

### Files to Modify

| File | Change |
|------|--------|
| `packages/shared/src/schemas/sales.ts` | Add/align discount fields and validation in invoice create/update schemas |
| `packages/modules/sales/src/services/invoice-service.ts` | Apply/validate header discounts before tax; enforce discount <= subtotal |
| `packages/modules/sales/src/services/sales-db.ts` | Ensure discount fields are persisted/loaded in invoice operations |
| `apps/api/src/routes/sales/invoices.ts` | Ensure request/response handling maps discount fields consistently |
| `apps/api/__test__/integration/sales/` | Add/update integration tests for discount scenarios |
| `packages/db/src/migrations/` (optional fallback) | Add guarded migration only if target env is missing columns |

### Migration Details (Fallback Only)

- Do not assume migration is required.
- If fallback is needed, migration must be idempotent and MySQL/MariaDB portable.
- Preserve nullable semantics for backward compatibility.

### Calculation Order

1. Compute line subtotal = sum(line.quantity * line.unit_price - line.discount_amount)
2. Compute invoice subtotal = sum(line subtotals)
3. Apply invoice‑level discounts:
   - discount_amount_percent = subtotal * (discount_percent / 100)
   - discount_amount_fixed = discount_fixed
   - total_discount = discount_amount_percent + discount_amount_fixed
4. Validate total_discount ≤ subtotal (allow zero taxable amount, but not negative)
5. taxable = subtotal - total_discount
6. tax_amount = compute tax on taxable (using existing tax logic)
7. grand_total = taxable + tax_amount

### Validation

- `discount_percent` must be ≤ 100 (can be 0).
- `discount_fixed` must be ≥ 0.
- If both are NULL, no header discount.
- If either is provided, the other defaults to NULL (or zero?) — we'll treat NULL as zero for calculation.

## Test Coverage Criteria

- [x] Schema baseline verified (or fallback migration applied safely)
- [x] Invoice create with discount_percent only calculates correct taxable amount
- [x] Invoice create with discount_fixed only calculates correct taxable amount
- [x] Invoice create with both discounts applies percent then fixed
- [x] Invoice create with discount > subtotal returns 400
- [x] Invoice update can add/remove/modify discounts
- [x] Tax amount computed on discounted taxable amount
- [x] Grand total includes tax

## Test Fixtures

- Create invoice with multiple line items, varying subtotals.
- Use existing tax rates.

## Tasks / Subtasks

- [ ] Verify schema baseline in target environments
- [ ] Create fallback guarded migration only if columns are missing
- [ ] Update/align shared Zod schemas
- [ ] Update invoice service behavior for discount validation and calculations
- [ ] Ensure API layer maps/returns discount fields consistently
- [ ] Add/update integration tests
- [ ] Run typecheck, lint, and tests

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/shared/src/schemas/sales.ts` | Modify | Add/align discount fields and bounds |
| `packages/modules/sales/src/services/invoice-service.ts` | Modify | Validate and apply header discounts before tax |
| `packages/modules/sales/src/services/sales-db.ts` | Modify | Persist/read discount fields |
| `apps/api/src/routes/sales/invoices.ts` | Modify | Ensure API validation/mapping consistency |
| `apps/api/__test__/integration/sales/*.test.ts` | Modify/Create | Discount behavior and regression coverage |
| `packages/db/src/migrations/0162_*.sql` | Optional | Guarded fallback migration if schema gap exists |

## Estimated Effort

2 hours

## Risk Level

Medium — changes to invoice totals calculation; must ensure no regression for existing invoices and no duplicate schema churn.

## Dev Notes

- Keep nullable semantics for legacy invoices (`NULL` discount means none).
- Apply invoice-level discounts after line subtotal and before tax.
- Use deterministic decimal-safe arithmetic; avoid float drift.
- Validation must exist in service layer, not only Zod.

## Validation Evidence

```bash
npm run db:migrate -w @jurnapod/db
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/api
npm run test:integration -w @jurnapod/api
```

## Dependencies

None (can run parallel with 44.1).

## Technical Debt Review

- [ ] No shortcuts taken that require follow‑up
- [ ] No `TODO`/`FIXME` comments left in production code
- [ ] No `as any` casts added without justification
- [ ] No deprecated functions used
- [ ] No N+1 query patterns introduced
- [ ] No in‑memory state introduced
- [ ] Integration tests included

## ADR References

- [ADR-0021: Invoice Pricing Contract](../../../../docs/adr/adr-0021-invoice-pricing-contract.md)
