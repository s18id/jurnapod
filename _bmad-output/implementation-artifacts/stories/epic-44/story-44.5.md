# Story 44.5: Credit Note Customer Flow

**Status:** planned
**Priority:** P1

## Story

As a **sales user**,
I want **credit notes to inherit the customer_id from the source invoice**,
So that **credit notes are properly associated with the same customer for AR reconciliation**.

## Context

Credit notes (`sales_credit_notes`) currently have no `customer_id` column. When a credit note is created from an invoice (or manually), it should automatically carry the invoice's `customer_id`. This ensures AR ageing and customer statements treat credit notes as reductions of the customer's outstanding balance. The column should be nullable (for credit notes not linked to an invoice). The UI may allow overriding (out of scope). The change must be backward compatible: existing credit notes remain without a customer (NULL).

## Acceptance Criteria

**AC1: Add customer_id column to sales_credit_notes**
**Given** the database schema
**When** migration is applied
**Then** `sales_credit_notes` has a nullable `customer_id` BIGINT column
**And** foreign key constraint references `customers(id)`
**And** index on `customer_id` for join performance

**AC2: Inherit customer_id from source invoice**
**Given** a credit note created from an invoice (via `source_invoice_id`)
**When** the credit note is saved
**Then** its `customer_id` is automatically set to the invoice's `customer_id`
**And** the value cannot be overridden via API (UI may allow override in future)

**AC3: Update credit note create/update schemas**
**Given** the shared Zod contracts
**When** a developer inspects `SalesCreditNoteCreateRequestSchema` and `SalesCreditNoteUpdateRequestSchema`
**Then** they include optional `customer_id` field (number, nullable)
**And** validation ensures `customer_id` references a customer belonging to the same company

**AC4: ACL enforcement on customer assignment**
**Given** a user attempting to create/update a credit note with `customer_id`
**When** the user lacks `platform.customers.READ` permission
**Then** the request is rejected with 403
**And** if the user has `platform.customers.READ` but the customer belongs to another company, also 403

**AC5: Integration tests**
**Given** the test suite
**When** `npm run test:integration -w @jurnapod/api` is executed
**Then** tests exist for:
- Credit note created from invoice inherits customer_id
- Credit note created manually can have customer_id set
- Credit note update can modify customer_id (with proper ACL)
- ACL denial for missing platform.customers.READ
- Foreign key constraint prevents invalid customer_id
**And** they pass

## Technical Details

### Files to Modify

| File | Change |
|------|--------|
| `packages/db/src/migrations/` | New migration: add `customer_id` to `sales_credit_notes` |
| `packages/shared/src/contracts/sales/credit-notes.ts` | Add `customer_id` to create/update schemas |
| `packages/modules/sales/src/credit-note-service.ts` | Update `createCreditNote` to inherit from invoice |
| `apps/api/src/routes/sales/credit-notes.ts` | Update handlers to validate customer access |
| `apps/api/__test__/integration/sales/credit-notes-customer.test.ts` | New integration tests |

### Migration Details

- Column: `customer_id BIGINT NULL`
- Foreign key: `ADD CONSTRAINT fk_sales_credit_notes_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT`
- Index: `ADD INDEX idx_sales_credit_notes_customer_id (customer_id)`
- The column must be nullable for credit notes not linked to an invoice.

### Inheritance Logic

- In `credit-note-service.ts`, `createCreditNote` method:
  - If `source_invoice_id` is provided, fetch the invoice's `customer_id`.
  - If invoice has a customer_id, set it on the credit note.
  - If invoice has no customer_id, leave credit note `customer_id` NULL.
- The API may still accept `customer_id` in the request body; if provided, it must be validated (same company, user has permission). If both source invoice and request body provide customer_id, request body overrides? We'll decide: request body overrides, but must match invoice's customer_id? Simpler: ignore request body customer_id when source_invoice_id present (inherit only). We'll implement: if source_invoice_id present, ignore customer_id from request; inherit from invoice.

### ACL Enforcement

- Similar to invoice customer linking: require `platform.customers.READ` permission when `customer_id` is present (or being set).
- Check that customer belongs to same company (and outlet if applicable).

## Test Coverage Criteria

- [x] Migration adds column and foreign key
- [x] Credit note created from invoice inherits invoice.customer_id
- [x] Credit note created manually with customer_id succeeds (with ACL)
- [x] Credit note created with invalid customer_id (different company) fails with 403
- [x] Credit note update can change customer_id (with ACL)
- [x] Credit note update without platform.customers.READ permission fails
- [x] Foreign key prevents linking to non‑existent customer
- [x] Existing credit notes remain accessible (customer_id NULL)

## Test Fixtures

- Create test company, outlet, customer(s), invoice with customer.
- Use existing credit‑note fixtures.

## Tasks / Subtasks

- [ ] Write migration for `customer_id` column
- [ ] Update shared Zod schemas
- [ ] Update `credit-note-service` create method to inherit customer from invoice
- [ ] Add ACL check in route handler for customer assignment
- [ ] Create integration tests
- [ ] Run typecheck, lint, and tests

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/db/src/migrations/0163-add-customer-id-to-sales-credit-notes.ts` | Create | Add column and FK |
| `packages/shared/src/contracts/sales/credit-notes.ts` | Modify | Add customer_id field |
| `packages/modules/sales/src/credit-note-service.ts` | Modify | Inherit customer from invoice |
| `apps/api/src/routes/sales/credit-notes.ts` | Modify | Add customer ACL check |
| `apps/api/__test__/integration/sales/credit-notes-customer.test.ts` | Create | Integration tests |

## Estimated Effort

2 hours

## Risk Level

Low — additive column; inheritance logic is straightforward.

## Dev Notes

- Migration should use `ALTER TABLE sales_credit_notes ADD COLUMN customer_id BIGINT NULL` followed by foreign key addition.
- The foreign key `ON DELETE RESTRICT` prevents deleting a customer that still has credit notes (soft delete already handles).
- If source_invoice_id is NULL (manual credit note), customer_id may be provided or left NULL.
- ACL check: if `customer_id` is `null` or undefined, skip the platform.customers.READ requirement.
- Ensure the credit note list endpoints include customer fields (join) for UI display.

## Validation Evidence

```bash
npm run db:migrate -w @jurnapod/db
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/api
npm run test:integration -w @jurnapod/api
```

## Dependencies

- 44.1 (Customer Master) — customers table must exist.
- 44.2 (Invoice → Customer Link) — invoices have customer_id.

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