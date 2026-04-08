# Story 35.1: Extract accounts.ts to modules-accounting

## Story Details

| Field | Value |
|-------|-------|
| **Epic** | Epic 35 |
| **Status** | in-progress |
| **Estimate** | 8h |
| **Priority** | P1 |
| **Dependencies** | None |

## Context

The `apps/api/src/routes/accounts.ts` file has 2 `no-route-business-logic` violations at lines 1126 and 1220. Both violations involve direct `getDb()` calls and service instantiation within route handlers.

## Current Problems

1. **Line 1126**: `const { getDb } = await import("../lib/db.js"); const db = getDb();` followed by passing `db` to `closeFiscalYear()`
2. **Line 1220**: `const { getDb } = await import("../lib/db.js"); const db = getDb(); const journalsService = new JournalsService(db);`

Both patterns violate ADR-0012 (Library-First Architecture) which requires routes to delegate database operations to library functions.

## Implementation

### Step 1: Create fiscal-year-close service in modules-accounting

Create `packages/modules/accounting/src/fiscal-year-close-service.ts`:

```typescript
// packages/modules/accounting/src/fiscal-year-close-service.ts

export interface CloseFiscalYearOptions {
  companyId: number;
  requestedByUserId: number;
  requestedAtEpochMs: number;
  reason?: string;
}

export interface CloseFiscalYearResult {
  status: 'SUCCESS' | 'IDEMPOTENT' | 'FAILED';
  closeRequestId: string;
  journalBatchId?: number;
  message?: string;
}

export async function closeFiscalYearForRoute(
  options: CloseFiscalYearOptions & { closeRequestId: string }
): Promise<CloseFiscalYearResult> {
  const { getDb } = await import("@jurnapod/db");
  const db = getDb();
  
  // Move all the logic from the route here, including:
  // - JournalsService instantiation
  // - db.transaction() wrapping
  // - getFiscalYearClosePreview call
  // - Journal batch creation for closing entries
  // - closeFiscalYear call
  
  // Return structured result to route
}
```

### Step 2: Update accounts.ts route

**Before (lines 1117-1140):**
```typescript
const { getDb } = await import("../lib/db.js");
const db = getDb();
const closeResult = await closeFiscalYear(db, fiscalYearId, closeRequestId, {...});
```

**After:**
```typescript
import { closeFiscalYearForRoute } from "@jurnapod/modules-accounting/fiscal-year-close-service";

const closeResult = await closeFiscalYearForRoute({
  companyId: auth.companyId,
  fiscalYearId,
  closeRequestId,
  requestedByUserId: auth.userId ?? 0,
  requestedAtEpochMs: Date.now(),
  reason: reason ?? "Fiscal year close initiated"
});
```

### Step 3: Update accounts.ts route (second occurrence, line 1220)

The `closeFiscalYear` endpoint at line ~1205 also has direct `getDb()` and `JournalsService` instantiation.

**Before:**
```typescript
const { JournalsService, checkGlImbalanceByBatchId } = await import("@jurnapod/modules-accounting");
const { getDb } = await import("../lib/db.js");
const db = getDb();
const journalsService = new JournalsService(db);
const result = await db.transaction().execute(async (trx) => {...});
```

**After:**
```typescript
const closeResult = await closeFiscalYearForRoute({
  companyId: auth.companyId,
  fiscalYearId,
  closeRequestId,
  requestedByUserId: auth.userId ?? 0,
  requestedAtEpochMs: Date.now(),
  reason: reason ?? "Fiscal year close initiated"
});
```

### Step 4: Delete adapter shim (if exists)

Check for and delete `apps/api/src/lib/fiscal-year-close.ts` or similar adapter shim after migration.

## Acceptance Criteria

| # | Criteria | Verification |
|---|---------|--------------|
| 1 | No `getDb()` calls in `apps/api/src/routes/accounts.ts` | `grep -n "getDb\|pool.execute" apps/api/src/routes/accounts.ts` returns empty |
| 2 | No `new JournalsService` in route | `grep -n "new JournalsService" apps/api/src/routes/accounts.ts` returns empty |
| 3 | Route imports from `@jurnapod/modules-accounting` | Import statement present |
| 4 | Fiscal year close functionality works | Manual test or existing integration test |
| 5 | `npm run lint -w @jurnapod/api` passes | 0 errors for accounts.ts |

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/routes/accounts.ts` | Remove `getDb()` calls, delegate to package function |
| `packages/modules/accounting/src/fiscal-year-close-service.ts` | Create new service |
| `apps/api/src/lib/fiscal-year-close.ts` | Delete adapter shim if exists |

## Kysely Pattern Reference

If the service needs to create new queries, use Kysely:

```typescript
import { getDb } from "@jurnapod/db";

// Inside service
const db = getDb();
const result = await db.kysely
  .selectFrom("journal_batches")
  .where("company_id", "=", companyId)
  .where("id", "=", batchId)
  .selectAll()
  .executeTakeFirst();
```
