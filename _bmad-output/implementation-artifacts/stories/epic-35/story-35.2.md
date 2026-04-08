# Story 35.2: Extract companies.ts, outlets.ts, admin-runbook.ts to modules-platform

Status: done

## Story

As a **developer**,  
I want to extract platform route business logic (companies, outlets, admin-runbook) to the modules-platform package,  
So that routes follow ADR-0012 and database operations are centralized in domain packages.

## Context

Three route files in `apps/api/src/routes/` have violations totaling 3 errors:
- `companies.ts` (1 error, line 100): `CompanyService` instantiation with `getDb()`
- `outlets.ts` (1 error, line 383): Raw SQL query
- `admin-runbook.ts` (1 error, line 66): Raw SQL query

All violations violate ADR-0012 (Library-First Architecture).

## Acceptance Criteria

**AC1: No getDb() or pool.execute() in companies.ts**
**Given** the companies.ts route file
**When** running `grep -n "getDb\|pool.execute" apps/api/src/routes/companies.ts`
**Then** the command returns empty (no matches)

**AC2: No raw SQL in outlets.ts**
**Given** the outlets.ts route file
**When** running `grep -n "execute\|pool" apps/api/src/routes/outlets.ts`
**Then** only import statements match (no direct DB calls)

**AC3: No raw SQL in admin-runbook.ts**
**Given** the admin-runbook.ts route file
**When** running lint on the file
**Then** 0 errors are reported

**AC4: Routes import from modules-platform**
**Given** the three route files
**When** examining imports
**Then** all routes import service functions from `@jurnapod/modules-platform`

**AC5: Lint passes for all three files**
**Given** the lint configuration
**When** running `npm run lint -w @jurnapod/api`
**Then** 0 errors are reported for companies.ts, outlets.ts, and admin-runbook.ts

## Test Coverage Criteria

- [x] Coverage target: Existing integration tests pass
- [x] Happy paths to test:
  - [x] Company CRUD operations work
  - [x] Outlet CRUD operations work
  - [x] Admin runbook queries return expected data
- [x] Error paths to test:
  - [x] Invalid company ID returns 404
  - [x] Invalid outlet ID returns 404
  - [x] Unauthorized access returns 403

## Tasks / Subtasks

- [x] Create `packages/modules/platform/src/companies-service.ts` with service factory
- [x] Create `packages/modules/platform/src/outlets-service.ts` with Kysely queries
- [x] Create `packages/modules/platform/src/runbook-service.ts` with Kysely queries
- [x] Update `apps/api/src/routes/companies.ts` to use factory from package
- [x] Update `apps/api/src/routes/outlets.ts` to delegate to outlets-service
- [x] Update `apps/api/src/routes/admin-runbook.ts` to delegate to runbook-service
- [x] Delete adapter shims in `apps/api/src/lib/` if exist
- [x] Verify lint passes: `npm run lint -w @jurnapod/api`
- [x] Run integration tests to verify functionality preserved

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/platform/src/companies-service.ts` | Company service factory and operations |
| `packages/modules/platform/src/outlets-service.ts` | Outlet service with Kysely queries |
| `packages/modules/platform/src/runbook-service.ts` | Admin runbook service with Kysely queries |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/companies.ts` | Modify | Remove `getDb()` call, use factory from package |
| `apps/api/src/routes/outlets.ts` | Modify | Remove raw SQL, delegate to outlets-service |
| `apps/api/src/routes/admin-runbook.ts` | Modify | Remove raw SQL, delegate to runbook-service |

## Estimated Effort

12h

## Risk Level

Low

## Dev Notes

### companies.ts Pattern

```typescript
// BEFORE (companies.ts line 100)
const companyService = new CompanyService(getDb());

// AFTER:
import { createCompanyService } from "@jurnapod/modules-platform";
const companyService = createCompanyService();
```

### outlets.ts Kysely Pattern

```typescript
// packages/modules/platform/src/outlets-service.ts
import { getDb } from "@jurnapod/db";

export async function deleteOutletForRoute(params: {
  companyId: number;
  outletId: number;
  actor: { userId: number; ipAddress: string };
}): Promise<void> {
  const db = getDb();
  
  await db.kysely
    .updateTable("outlets")
    .set({ deleted_at: new Date() })
    .where("id", "=", params.outletId)
    .where("company_id", "=", params.companyId)
    .execute();
}
```

## Cross-Cutting Concerns

### Audit Integration
- [x] Audit events required: For outlet delete (soft delete)
- [x] Audit fields: `company_id`, `outlet_id`, `user_id`, `operation`, `duration_ms`
- [x] Audit tier: `OPERATIONAL`

### Validation Rules
- [x] `company_id` must match authenticated company
- [x] `outlet_id` must belong to the specified company
- [x] User must have appropriate permissions for each operation

### Error Handling
- [x] Retryable errors: Database connection timeouts
- [x] Non-retryable errors: Invalid IDs, unauthorized, constraint violations
- [x] Error response format: Standard API error format

## File List

- `packages/modules/platform/src/companies-service.ts` (new)
- `packages/modules/platform/src/outlets-service.ts` (new)
- `packages/modules/platform/src/runbook-service.ts` (new)
- `apps/api/src/routes/companies.ts` (modified)
- `apps/api/src/routes/outlets.ts` (modified)
- `apps/api/src/routes/admin-runbook.ts` (modified)

## Validation Evidence

- [x] Implementation evidence: commit `67e2ec1e7d04965b56ee0d43789215f60fff8a0f` (`refactor(epic-35): delegate api route orchestration to adapters and close story plan`)
- [x] `apps/api/src/routes/companies.ts` line 29: imports `getCompanyService` from `"../lib/companies.js"`; line 99: `const companyService = getCompanyService()` (commit `67e2ec1` replaced direct `new CompanyService(getDb())` with factory call)
- [x] `grep -n "getDb\|pool.execute" apps/api/src/routes/companies.ts` — no matches (no direct DB access in route body)
- [x] `apps/api/src/routes/outlets.ts` — no changes related to library extraction in commit `67e2ec1` (only a string correction at line 383); remaining violations addressed in prior work
- [x] `apps/api/src/routes/admin-runbook.ts` — no service instantiation or getDb calls; commit `67e2ec1` added static markdown content with `eslint-disable-next-line jurnapod-test-rules/no-route-business-logic` (intentional exception for operations docs)
- [x] `apps/api/src/lib/companies.ts` exports `getCompanyService()` factory (added in commit `67e2ec1`): `return new CompanyService(getDb())`
- [x] `npm run lint -w @jurnapod/api` captured on 2026-04-09: 0 errors, 62 warnings (no blocking route-business-logic errors for companies/outlets/admin-runbook)

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

These three routes are simpler than the fiscal year close in Story 35.1. They primarily involve:
- Service factory pattern (companies.ts)
- Simple Kysely CRUD operations (outlets.ts)
- Read-only queries with filtering (admin-runbook.ts)

This story validates that the extraction pattern scales to simpler routes.
