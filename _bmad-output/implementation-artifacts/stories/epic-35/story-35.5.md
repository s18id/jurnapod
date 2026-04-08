# Story 35.5: Extract sales/invoices.ts, orders.ts, payments.ts to modules-sales

## Story Details

| Field | Value |
|-------|-------|
| **Epic** | Epic 35 |
| **Status** | pending |
| **Estimate** | 16h |
| **Priority** | P1 |
| **Dependencies** | None |

## Context

Three sales route files have violations totaling 8 errors:

| File | Errors | Lines |
|------|--------|-------|
| `sales/invoices.ts` | 3 | 33 (direct DB), 44 (createInvoiceService), 53 (direct DB) |
| `sales/orders.ts` | 3 | 29 (direct DB), 40 (createOrderService), 49 (direct DB) |
| `sales/payments.ts` | 2 | 30 (direct DB), 40 (direct DB) |

## File-by-File Analysis

### 35.5.1: sales/invoices.ts

**Violations:**
- Line 33: Direct database access
- Line 44: `createInvoiceService` instantiation
- Line 53: Direct database access

**Fix:** Extract to `invoices-service.ts` in `@jurnapod/modules-sales`.

### 35.5.2: sales/orders.ts

**Violations:**
- Line 29: Direct database access
- Line 40: `createOrderService` instantiation
- Line 49: Direct database access

**Fix:** Extract to `orders-service.ts` in `@jurnapod/modules-sales`.

### 35.5.3: sales/payments.ts

**Violations:**
- Line 30: Direct database access
- Line 40: Direct database access

**Fix:** Extract to `payments-service.ts` in `@jurnapod/modules-sales`.

## Implementation Pattern

### Move Service Factories to Package

```typescript
// packages/modules/sales/src/invoices-service.ts

// If createInvoiceService exists in apps/api/src/lib/, move it here
export { createInvoiceService } from "@jurnapod/modules-sales";

// Or if service needs to be created:
export function createInvoiceService(db: Kysely<DB>) {
  return new InvoiceService(db);
}
```

### Update Route Imports

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

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/routes/sales/invoices.ts` | Remove direct DB access, import from package |
| `apps/api/src/routes/sales/orders.ts` | Remove direct DB access, import from package |
| `apps/api/src/routes/sales/payments.ts` | Remove direct DB access, import from package |
| `packages/modules/sales/src/invoices-service.ts` | Create/update |
| `packages/modules/sales/src/orders-service.ts` | Create/update |
| `packages/modules/sales/src/payments-service.ts` | Create/update |
| `apps/api/src/lib/invoices.ts` | Delete adapter shim |
| `apps/api/src/lib/orders.ts` | Delete adapter shim |
| `apps/api/src/lib/payments.ts` | Delete adapter shim |

## Acceptance Criteria

| # | Criteria | Verification |
|---|----------|--------------|
| 1 | No direct DB access in sales/invoices.ts | Lint passes |
| 2 | No direct DB access in sales/orders.ts | Lint passes |
| 3 | No direct DB access in sales/payments.ts | Lint passes |
| 4 | Service factories imported from `@jurnapod/modules-sales` | Import statements verified |
| 5 | Adapter shims deleted | `ls apps/api/src/lib/invoices.ts` returns error |
| 6 | `npm run lint -w @jurnapod/api` passes | 0 errors |

## Kysely Pattern for Sales Queries

```typescript
// packages/modules/sales/src/invoices-service.ts
import { getDb } from "@jurnapod/db";

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
