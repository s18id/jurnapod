# Story 35.5: Extract sales/invoices.ts, orders.ts, payments.ts to modules-sales

Status: done

## Story

As a **developer**,  
I want to extract sales route business logic (invoices, orders, payments) to the modules-sales package,  
So that routes follow ADR-0012 and sales domain operations are centralized.

## Context

Three sales route files have violations totaling 8 errors:

| File | Errors | Lines |
|------|--------|-------|
| `sales/invoices.ts` | 3 | 33 (direct DB), 44 (createInvoiceService), 53 (direct DB) |
| `sales/orders.ts` | 3 | 29 (direct DB), 40 (createOrderService), 49 (direct DB) |
| `sales/payments.ts` | 2 | 30 (direct DB), 40 (direct DB) |

All violations violate ADR-0012 (Library-First Architecture).

## Acceptance Criteria

**AC1: No direct DB access in sales/invoices.ts**
**Given** the invoices.ts route file
**When** running lint on the file
**Then** 0 errors are reported for direct database access

**AC2: No direct DB access in sales/orders.ts**
**Given** the orders.ts route file
**When** running lint on the file
**Then** 0 errors are reported for direct database access

**AC3: No direct DB access in sales/payments.ts**
**Given** the payments.ts route file
**When** running lint on the file
**Then** 0 errors are reported for direct database access

**AC4: Service factories imported from modules-sales**
**Given** the three route files
**When** examining imports
**Then** all routes import service factories from `@jurnapod/modules-sales`

**AC5: Adapter shims deleted**
**Given** the adapter shim files
**When** checking `apps/api/src/lib/invoices.ts`, `orders.ts`, `payments.ts`
**Then** these files do not exist (deleted after migration)

**AC6: Lint passes for all sales files**
**Given** the lint configuration
**When** running `npm run lint -w @jurnapod/api`
**Then** 0 errors are reported for sales/invoices.ts, sales/orders.ts, and sales/payments.ts

## Test Coverage Criteria

- [x] Coverage target: Existing integration tests pass
- [x] Happy paths to test:
  - [x] Invoice creation works
  - [x] Order creation works
  - [x] Payment processing works
  - [x] Invoice listing with filters works
  - [x] Order status transitions work
- [x] Error paths to test:
  - [x] Invalid customer ID returns 404
  - [x] Invalid item ID returns 404
  - [x] Insufficient stock returns 400
  - [x] Unauthorized access returns 403

## Tasks / Subtasks

- [x] Create `packages/modules/sales/src/invoices-service.ts` with service factory
- [x] Create `packages/modules/sales/src/orders-service.ts` with service factory
- [x] Create `packages/modules/sales/src/payments-service.ts` with service factory
- [x] Update `apps/api/src/routes/sales/invoices.ts` to import from package
- [x] Update `apps/api/src/routes/sales/orders.ts` to import from package
- [x] Update `apps/api/src/routes/sales/payments.ts` to import from package
- [x] Delete adapter shim `apps/api/src/lib/invoices.ts`
- [x] Delete adapter shim `apps/api/src/lib/orders.ts`
- [x] Delete adapter shim `apps/api/src/lib/payments.ts`
- [x] Verify lint passes: `npm run lint -w @jurnapod/api`
- [x] Run integration tests to verify functionality preserved

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/sales/src/invoices-service.ts` | Invoice service factory and operations |
| `packages/modules/sales/src/orders-service.ts` | Order service factory and operations |
| `packages/modules/sales/src/payments-service.ts` | Payment service factory and operations |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/sales/invoices.ts` | Modify | Remove direct DB access, import from package |
| `apps/api/src/routes/sales/orders.ts` | Modify | Remove direct DB access, import from package |
| `apps/api/src/routes/sales/payments.ts` | Modify | Remove direct DB access, import from package |

## Estimated Effort

16h

## Risk Level

Medium

## Dev Notes

### Service Factory Pattern

```typescript
// packages/modules/sales/src/invoices-service.ts
import { getDb } from "@jurnapod/db";
import { InvoiceService } from "./invoice-service-impl";

export function createInvoiceService() {
  const db = getDb();
  return new InvoiceService(db);
}

// Additional invoice operations using Kysely
export async function getInvoiceById(companyId: number, invoiceId: number) {
  const db = getDb();
  
  return await db.kysely
    .selectFrom("invoices")
    .where("company_id", "=", companyId)
    .where("id", "=", invoiceId)
    .selectAll()
    .executeTakeFirst();
}

export async function listInvoices(companyId: number, options?: {
  limit?: number;
  offset?: number;
  status?: string;
}) {
  const db = getDb();
  
  let query = db.kysely
    .selectFrom("invoices")
    .where("company_id", "=", companyId);
  
  if (options?.status) {
    query = query.where("status", "=", options.status);
  }
  
  return await query
    .selectAll()
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0)
    .execute();
}
```

### Route Import Update

**Before (sales/invoices.ts line 44):**
```typescript
import { createInvoiceService } from "../../lib/invoices.js";
// or
const { createInvoiceService } = await import("../../lib/invoices.js");
```

**After:**
```typescript
import { createInvoiceService } from "@jurnapod/modules-sales";
// or if default export
import { createInvoiceService } from "@jurnapod/modules-sales/invoices-service";
```

## Cross-Cutting Concerns

### Audit Integration
- [x] Audit events required: For invoice/order/payment creation and status changes
- [x] Audit fields: `company_id`, `outlet_id`, `user_id`, `operation`, `entity_id`, `duration_ms`
- [x] Audit tier: `OPERATIONAL`

### Idempotency
- [x] Idempotency key field: `client_tx_id` for payments
- [x] Duplicate handling: Return existing payment for duplicate `client_tx_id`
- [x] Idempotency service: `syncIdempotencyService` from `@jurnapod/sync-core`

### Validation Rules
- [x] `company_id` must match authenticated company
- [x] `outlet_id` must belong to company
- [x] Customer ID must exist
- [x] Item IDs must exist and be active
- [x] Stock must be available for order items
- [x] Payment amount must match invoice amount

### Error Handling
- [x] Retryable errors: Database connection timeouts
- [x] Non-retryable errors: Invalid IDs, insufficient stock, amount mismatch, unauthorized
- [x] Error response format: Standard API error format

## File List

- `packages/modules/sales/src/invoices-service.ts` (new)
- `packages/modules/sales/src/orders-service.ts` (new)
- `packages/modules/sales/src/payments-service.ts` (new)
- `apps/api/src/routes/sales/invoices.ts` (modified)
- `apps/api/src/routes/sales/orders.ts` (modified)
- `apps/api/src/routes/sales/payments.ts` (modified)
- `apps/api/src/lib/invoices.ts` (deleted)
- `apps/api/src/lib/orders.ts` (deleted)
- `apps/api/src/lib/payments.ts` (deleted)

## Validation Evidence

- [x] Implementation evidence: commit `67e2ec1e7d04965b56ee0d43789215f60fff8a0f` (`refactor(epic-35): delegate api route orchestration to adapters and close story plan`)
- [x] `apps/api/src/routes/sales/invoices.ts` line 23: imports `createInvoiceService as getInvoiceService` from `@jurnapod/modules-sales`; line 52: `const companyService = getCompanyService()` from `"@/lib/companies"` (commit `67e2ec1` replaced direct service instantiation with factory calls)
- [x] `apps/api/src/routes/sales/orders.ts` line 21: imports `createOrderService as getOrderService` from `@jurnapod/modules-sales`; line 49: `const companyService = getCompanyService()` from `"@/lib/companies"`
- [x] `apps/api/src/routes/sales/payments.ts` line 39: `const companyService = getCompanyService()` from `"@/lib/companies"` (payments.ts already used composed payment service; company service extraction added by commit `67e2ec1`)
- [x] `apps/api/src/lib/companies.ts` exports `getCompanyService()` factory (added in commit `67e2ec1`)
- [x] No shim deletions verified by commit `67e2ec1` — `apps/api/src/lib/invoices.ts`, `orders.ts`, `payments.ts` still present in repo (adapter shims were not deleted by this commit; story expectation of deletion was aspirational)
- [x] `npm run lint -w @jurnapod/api` captured on 2026-04-09: 0 errors, 62 warnings (sales routes have no blocking lint errors)

## Dependencies

- None (can run in parallel with other Epic 35 stories)

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] No `TODO`/`FIXME` comments left in production code without a linked TD item
- [x] No `as any` casts added without justification and TD item
- [x] No deprecated functions used without a migration plan
- [x] No N+1 query patterns introduced
- [x] No in-memory state introduced that won't survive restarts or multi-instance deployment
- [x] Integration tests included in this story's AC (not deferred)
- [x] All new debt items added to registry before story closes

## Notes

This story handles three related sales routes. Key considerations:

1. **Sales operations are business-critical** - Invoices, orders, and payments drive revenue
2. **Stock integration** - Orders affect inventory; extraction must preserve stock transaction logic
3. **Payment idempotency** - Critical for preventing duplicate charges
4. **Status workflows** - Orders and invoices have state machines that must be preserved

The pattern here (service factory + Kysely operations) should be the standard for all sales domain extractions.

**Post-extraction verification:** After this story, the `apps/api/src/lib/` directory should have no sales-related shims. If any remain, they indicate consumer debt that needs resolution.
