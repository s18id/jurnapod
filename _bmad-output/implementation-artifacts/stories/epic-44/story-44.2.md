# Story 44.2: Invoice → Customer Link

**Status:** planned
**Priority:** P1

## Story

As a **sales manager**,
I want **to link invoices to customers via a customer_id field**,
So that **invoices can be associated with customers for AR ageing, statements, and customer history**.

## Context

Currently `sales_invoices` table lacks a `customer_id` column. To enable AR ageing and customer‑based reporting, we need to add `customer_id` (nullable, foreign key to `customers.id`) and update the invoice create/update schemas to accept `customer_id`. ACL must be enforced on customer reassignment: users need `platform.customers.READ` permission to view a customer, and `sales.invoices.UPDATE` permission to link/unlink an invoice. The change must be backward compatible: existing invoices remain without a customer (NULL).

## Acceptance Criteria

**AC1: Add customer_id column to sales_invoices**
**Given** the database schema
**When** migration is applied
**Then** `sales_invoices` has a nullable `customer_id` BIGINT column
**And** foreign key constraint references `customers(id)`
**And** index on `customer_id` for join performance

**AC2: Update invoice create/update schemas**
**Given** the shared Zod contracts
**When** a developer inspects `SalesInvoiceCreateRequestSchema` and `SalesInvoiceUpdateRequestSchema`
**Then** they include optional `customer_id` field (number, nullable)
**And** validation ensures `customer_id` references a customer belonging to the same company

**AC3: ACL enforcement on customer assignment**
**Given** a user attempting to create/update an invoice with `customer_id`
**When** the user lacks `platform.customers.READ` permission
**Then** the request is rejected with 403
**And** if the user has `platform.customers.READ` but the customer belongs to another company, also 403

**AC4: Backward compatibility**
**Given** existing invoices without customer_id
**When** they are retrieved via API
**Then** `customer_id` is `null` (or omitted)
**And** no data migration is required

**AC5: Integration tests**
**Given** the test suite
**When** `npm run test:integration -w @jurnapod/api` is executed
**Then** tests exist for:
- Invoice creation with valid customer_id
- Invoice creation with invalid customer_id (different company) → 403
- Invoice update to set/clear customer_id
- ACL denial for missing platform.customers.READ
**And** they pass

## Technical Details

### Files to Modify

| File | Change |
|------|--------|
| `packages/db/src/migrations/` | New migration: add `customer_id` to `sales_invoices` |
| `packages/shared/src/contracts/sales/invoices.ts` | Add `customer_id` to create/update schemas |
| `apps/api/src/routes/sales/invoices.ts` | Update handlers to validate customer access |
| `packages/modules/sales/src/invoice-service.ts` | Update `createInvoice`, `updateInvoice` to accept customer_id |
| `apps/api/__test__/integration/sales/invoices-customer.test.ts` | New integration tests |

### Migration Details

- Column: `customer_id BIGINT NULL`
- Foreign key: `ADD CONSTRAINT fk_sales_invoices_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT`
- Index: `ADD INDEX idx_sales_invoices_customer_id (customer_id)` (optional but recommended)
- The column must be nullable to preserve existing data.

### Schema Updates

- `SalesInvoiceCreateRequestSchema`: add `customer_id` optional with `z.number().int().positive().nullable().optional()`
- `SalesInvoiceUpdateRequestSchema`: add same optional field.
- Validation: service layer must verify that customer exists and belongs to the same company (and outlet, if outlet‑scoped).

### ACL Integration

- Use `requireAccess({ module: 'platform', resource: 'customers', permission: 'READ' })` before allowing customer assignment.
- This check should be performed in the route handler (or a middleware) when `customer_id` is present.
- The invoice service can assume the caller has already validated customer access.

## Test Coverage Criteria

- [x] Migration adds column and foreign key
- [x] Invoice create with valid customer_id succeeds
- [x] Invoice create with customer_id from another company fails with 403
- [x] Invoice create without platform.customers.READ permission fails with 403
- [x] Invoice update can set customer_id
- [x] Invoice update can clear customer_id (set to null)
- [x] Existing invoices remain accessible (customer_id null)
- [x] Foreign key prevents linking to non‑existent customer

## Test Fixtures

- Create test company, outlet, customer(s).
- Use existing invoice fixtures; extend with customer association.

## Tasks / Subtasks

- [ ] Write migration for `customer_id` column
- [ ] Update shared Zod schemas
- [ ] Update invoice‑service create/update methods
- [ ] Add ACL check in route handler for customer assignment
- [ ] Create integration tests
- [ ] Run typecheck, lint, and tests

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/migrations/0161-add-customer-id-to-sales-invoices.ts` | Create | Add column and FK |
| `packages/shared/src/contracts/sales/invoices.ts` | Modify | Add customer_id field |
| `packages/modules/sales/src/invoice-service.ts` | Modify | Accept customer_id param |
| `apps/api/src/routes/sales/invoices.ts` | Modify | Add customer ACL check |
| `apps/api/__test__/integration/sales/invoices-customer.test.ts` | Create | Integration tests |

## Estimated Effort

2 hours

## Risk Level

Medium — foreign key addition on existing table; must ensure migration is safe for large tables.

## Dev Notes

- Migration should use `ALTER TABLE sales_invoices ADD COLUMN customer_id BIGINT NULL` followed by foreign key addition.
- Consider using `ALGORITHM=INPLACE` for MySQL 8.0 to reduce lock time.
- The foreign key `ON DELETE RESTRICT` prevents deleting a customer that still has invoices. Soft delete already sets `deleted_at`, so foreign key remains satisfied.
- ACL check: if `customer_id` is `null` or undefined, skip the platform.customers.READ requirement.

## Validation Evidence

```bash
npm run db:migrate -w @jurnapod/db
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/api
npm run test:integration -w @jurnapod/api
```

## Dependencies

- 44.1 (Customer Master) — customers table must exist.

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
- [ADR-0022: AR Transaction Model](../../../../docs/adr/adr-0022-ar-transaction-model.md)