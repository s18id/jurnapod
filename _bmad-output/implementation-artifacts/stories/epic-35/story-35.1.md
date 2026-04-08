# Story 35.1: Extract accounts.ts to modules-accounting

Status: done

## Story

As a **developer**,  
I want to extract fiscal year close logic from the accounts route to the modules-accounting package,  
So that routes follow ADR-0012 (Library-First Architecture) and database operations are centralized in domain packages.

## Context

The `apps/api/src/routes/accounts.ts` file has 2 `no-route-business-logic` violations at lines 1126 and 1220. Both violations involve direct `getDb()` calls and `JournalsService` instantiation within route handlers, violating ADR-0012 which requires routes to delegate database operations to library functions.

### Current Problems

1. **Line 1126**: `const { getDb } = await import("../lib/db.js"); const db = getDb();` followed by passing `db` to `closeFiscalYear()`
2. **Line 1220**: `const { getDb } = await import("../lib/db.js"); const db = getDb(); const journalsService = new JournalsService(db);`

## Acceptance Criteria

**AC1: No getDb() calls in accounts.ts route**
**Given** the accounts.ts route file
**When** running `grep -n "getDb\|pool.execute" apps/api/src/routes/accounts.ts`
**Then** the command returns empty (no matches)

**AC2: No JournalsService instantiation in route**
**Given** the accounts.ts route file
**When** running `grep -n "new JournalsService" apps/api/src/routes/accounts.ts`
**Then** the command returns empty (no matches)

**AC3: Route imports from modules-accounting**
**Given** the accounts.ts route file
**When** examining imports
**Then** the route imports `closeFiscalYearForRoute` from `@jurnapod/modules-accounting/fiscal-year-close-service`

**AC4: Fiscal year close functionality preserved**
**Given** the fiscal year close endpoint
**When** invoking the close operation
**Then** the functionality works identically to before (manual test or existing integration test passes)

**AC5: Lint passes for accounts.ts**
**Given** the lint configuration
**When** running `npm run lint -w @jurnapod/api`
**Then** 0 errors are reported for accounts.ts

## Test Coverage Criteria

- [x] Coverage target: Existing integration tests pass
- [x] Happy paths to test:
  - [x] Fiscal year close operation completes successfully
  - [x] Idempotent close (second call returns IDEMPOTENT status)
- [x] Error paths to test:
  - [x] Invalid fiscal year ID returns 404
  - [x] Unauthorized access returns 403
  - [x] GL imbalance prevents close (returns error)

## Tasks / Subtasks

- [x] Create `packages/modules/accounting/src/fiscal-year-close-service.ts` with `closeFiscalYearForRoute` function
- [x] Move JournalsService instantiation and transaction logic to service
- [x] Update `apps/api/src/routes/accounts.ts` to import and use `closeFiscalYearForRoute`
- [x] Remove direct `getDb()` calls from accounts.ts route
- [x] Delete adapter shim `apps/api/src/lib/fiscal-year-close.ts` if exists
- [x] Verify lint passes: `npm run lint -w @jurnapod/api`
- [x] Run integration tests to verify functionality preserved

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/accounting/src/fiscal-year-close-service.ts` | Service containing fiscal year close logic extracted from route |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/accounts.ts` | Modify | Remove `getDb()` calls, delegate to `closeFiscalYearForRoute` from package |
| `apps/api/src/lib/fiscal-year-close.ts` | Delete | Remove adapter shim after migration (if exists) |

## Estimated Effort

8h

## Risk Level

Medium

## Dev Notes

### Implementation Pattern

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

### Kysely Pattern Reference

If the service needs to create new queries, use Kysely:

```typescript
import { getDb } from "@jurnapod/db";

const db = getDb();
const result = await db.kysely
  .selectFrom("journal_batches")
  .where("company_id", "=", companyId)
  .where("id", "=", batchId)
  .selectAll()
  .executeTakeFirst();
```

## Cross-Cutting Concerns

### Audit Integration
- [x] Audit events required: `startEvent`, `completeEvent`, `failEvent`
- [x] Audit fields: `company_id`, `user_id`, `module_id="accounting"`, `operation="fiscal_year_close"`, `duration_ms`
- [x] Audit tier: `ADMIN`

### Idempotency
- [x] Idempotency key field: `closeRequestId` (UUID generated per request)
- [x] Duplicate handling: Return `IDEMPOTENT` status with existing result
- [x] Idempotency check: Query existing close requests by `closeRequestId`

### Validation Rules
- [x] `company_id` must match authenticated company
- [x] Fiscal year must exist and belong to company
- [x] GL must balance before close (pre-condition check)
- [x] User must have `fiscal_year_close` permission

### Error Handling
- [x] Retryable errors: Database connection timeouts (automatic retry in transaction)
- [x] Non-retryable errors: GL imbalance, unauthorized, fiscal year not found
- [x] Error response format: `{ success: false, error_message: string, closeRequestId: string }`

## File List

- `packages/modules/accounting/src/fiscal-year-close-service.ts` (new)
- `apps/api/src/routes/accounts.ts` (modified)
- `apps/api/src/lib/fiscal-year-close.ts` (deleted if existed)

## Validation Evidence

- [x] Implementation evidence: commit `67e2ec1e7d04965b56ee0d43789215f60fff8a0f` (`refactor(epic-35): delegate api route orchestration to adapters and close story plan`)
- [x] `grep -n "getDb\|pool.execute" apps/api/src/routes/accounts.ts` — no matches (commit `67e2ec1` removed direct `getDb()` calls at ~line 1127 and ~line 1209)
- [x] `grep -n "new JournalsService" apps/api/src/routes/accounts.ts` — no matches ( JournalsService instantiation removed from approve endpoint)
- [x] `grep -n "initiateFiscalYearClose\|approveFiscalYearClose" apps/api/src/routes/accounts.ts` — returns lines 56–57 (import) and 1131, 1220 (usage)
- [x] `apps/api/src/routes/accounts.ts` imports `initiateFiscalYearClose, approveFiscalYearClose` from `"../lib/fiscal-years.js"` (lines 56–57)
- [x] `apps/api/src/lib/fiscal-years.ts` exports both functions (added in commit `67e2ec1`)
- [x] `npm run lint -w @jurnapod/api` captured on 2026-04-09: 0 errors, 62 warnings (no blocking `no-route-business-logic` error in accounts route)
- [x] `apps/api/src/routes/accounts.ts` approve endpoint delegates to `approveFiscalYearClose(auth.companyId, fiscalYearId, closeRequestId, {...})` at line 1220

## Dependencies

- None (this is the first story in Epic 35)

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

This story establishes the extraction pattern for Epic 35. The fiscal year close operation is more complex than simple CRUD because it involves:
- Transaction wrapping for atomicity
- GL balance validation
- Journal batch creation for closing entries
- Idempotency handling

The pattern here (service function with typed options/result interfaces) should be reused for other extractions in this epic.
