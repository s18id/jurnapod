# Story 35.2: Extract companies.ts, outlets.ts, admin-runbook.ts to modules-platform

## Story Details

| Field | Value |
|-------|-------|
| **Epic** | Epic 35 |
| **Status** | pending |
| **Estimate** | 12h |
| **Priority** | P1 |
| **Dependencies** | None |

## Context

Three route files in `apps/api/src/routes/` have violations totaling 3 errors:
- `companies.ts` (1 error, line 100)
- `outlets.ts` (1 error, line 383)
- `admin-runbook.ts` (1 error, line 66)

## File-by-File Analysis

### 35.2.1: companies.ts — Line 100

**Violation:** `const companyService = new CompanyService(getDb());`

**Problem:** Service instantiation with `getDb()` call at module level.

**Fix:** Move `CompanyService` instantiation to a factory function in `@jurnapod/modules-platform`.

```typescript
// BEFORE (companies.ts line 100)
const companyService = new CompanyService(getDb());

// AFTER:
// Option A: If CompanyService already exists in modules-platform, import factory
import { createCompanyService } from "@jurnapod/modules-platform";
const companyService = createCompanyService();

// Option B: If CompanyService needs to be created, use module-level factory
// in the package that lazily creates the service
```

### 35.2.2: outlets.ts — Line 383

**Violation:** Raw SQL detected at line 383.

**Problem:** Direct SQL query in route.

**Fix:** Extract to `outlets-service.ts` in `@jurnapod/modules-platform` using Kysely.

```typescript
// BEFORE (outlets.ts line 383)
// Look for: pool.execute() or db.execute() with raw SQL

// AFTER:
// Create packages/modules/platform/src/outlets-service.ts
import { getDb } from "@jurnapod/db";

export async function deleteOutletRoute(companyId: number, outletId: number, actor: {...}) {
  const db = getDb();
  // Use Kysely or preserve raw SQL if complex
  // Return result
}
```

### 35.2.3: admin-runbook.ts — Line 66

**Violation:** Raw SQL detected at line 66:22.

**Problem:** The linter detects something as SQL on this line. Need to examine actual line.

**Fix:** Extract any DB access to `runbook-service.ts` in `@jurnapod/modules-platform`.

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/routes/companies.ts` | Remove `getDb()` call, use factory from package |
| `apps/api/src/routes/outlets.ts` | Remove raw SQL, delegate to package |
| `apps/api/src/routes/admin-runbook.ts` | Remove raw SQL, delegate to package |
| `packages/modules/platform/src/companies-service.ts` | Create/update |
| `packages/modules/platform/src/outlets-service.ts` | Create/update |
| `packages/modules/platform/src/runbook-service.ts` | Create |

## Acceptance Criteria

| # | Criteria | Verification |
|---|----------|--------------|
| 1 | No `getDb()` or `pool.execute()` in `companies.ts` | `grep -n "getDb\|pool.execute" apps/api/src/routes/companies.ts` returns empty |
| 2 | No raw SQL in `outlets.ts` | `grep -n "execute\|pool" apps/api/src/routes/outlets.ts` returns empty or only via imports |
| 3 | No raw SQL in `admin-runbook.ts` | Lint passes for this file |
| 4 | Routes import from `@jurnapod/modules-platform` | Import statements present |
| 5 | `npm run lint -w @jurnapod/api` passes for these files | 0 errors |

## Kysely Pattern

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
