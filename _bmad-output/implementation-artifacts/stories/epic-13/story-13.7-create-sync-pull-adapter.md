# Story 13.7: Create lib/sync/audit-adapter.ts

**Status:** done  
**Epic:** Epic 13: Complete Library Migration for Deferred Routes  
**Story ID:** 13-7-create-sync-pull-adapter  
**Estimated Effort:** 6 hours  
**Depends on:** 13.6 (Analysis complete - see sync-pull-analysis.md)

---

## Context

Based on Story 13.6 analysis, the `createSyncAuditService` adapter function is **duplicated** in two places:
1. `apps/api/src/routes/sync/pull.ts` (lines 53-84)
2. `apps/api/src/lib/sync/pull/index.ts` (lines 99-138)

The analysis recommends **Option B**: Extract to a dedicated library module to eliminate duplication and follow the Library Usage Rule.

---

## Implementation Plan

### Phase 1: Create Adapter Library

**File:** `apps/api/src/lib/sync/audit-adapter.ts`

```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Sync Audit Adapter
 *
 * Bridges mysql2 Pool interface to AuditDbClient interface required by
 * @jurnapod/modules-platform/sync SyncAuditService.
 *
 * This eliminates code duplication between routes/sync/pull.ts and
 * lib/sync/pull/index.ts.
 */

import type { Pool } from "mysql2/promise";
import { SyncAuditService, type AuditDbClient } from "@jurnapod/modules-platform/sync";

/**
 * Create a SyncAuditService instance from a mysql2 Pool.
 *
 * The adapter wraps mysql2's query/execute methods to match the
 * AuditDbClient interface expected by SyncAuditService.
 *
 * @param dbPool - mysql2 connection pool
 * @returns Configured SyncAuditService instance
 */
export function createSyncAuditService(dbPool: Pool): SyncAuditService {
  const client: AuditDbClient = {
    query: async <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> => {
      const [rows] = await dbPool.query(sql, params as (string | number | Date | null)[]);
      return rows as T[];
    },
    execute: async (sql: string, params?: unknown[]) => {
      const [result] = await dbPool.execute(sql, params as (string | number | Date | null)[]);
      return {
        affectedRows: (result as { affectedRows: number }).affectedRows,
        insertId: (result as { insertId?: number }).insertId,
      };
    },
    getConnection: async () => {
      const conn = await dbPool.getConnection();
      return {
        beginTransaction: () => conn.beginTransaction(),
        commit: () => conn.commit(),
        rollback: () => conn.rollback(),
        execute: async (sql: string, params?: unknown[]) => {
          const [result] = await conn.execute(sql, params as (string | number | Date | null)[]);
          return {
            affectedRows: (result as { affectedRows: number }).affectedRows,
            insertId: (result as { insertId?: number }).insertId,
          };
        },
        release: () => conn.release(),
      };
    },
  };
  return new SyncAuditService(client);
}
```

### Phase 2: Update routes/sync/pull.ts

**Changes:**
1. **Add import** at line ~27:
   ```typescript
   import { createSyncAuditService } from "../../lib/sync/audit-adapter.js";
   ```

2. **Remove** lines 53-84 (the local function definition)

3. **Remove** line 216 (`export { createSyncAuditService };`)

**File state after:**
- Only imports and uses `createSyncAuditService`
- No local implementation
- No export of the function

### Phase 3: Update lib/sync/pull/index.ts

**Changes:**
1. **Add import** at line ~17:
   ```typescript
   import { createSyncAuditService } from "../audit-adapter.js";
   ```

2. **Remove** lines 99-138 (the local function definition)

3. **Remove** lines 99-100:
   ```typescript
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   type DbPool = any;
   ```

**File state after:**
- Imports `createSyncAuditService` from adapter
- No local implementation
- No `any` type usage

### Phase 4: Create Tests

**File:** `apps/api/src/lib/sync/audit-adapter.test.ts`

Use **mock pools** for testing (recommended):

```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { closeDbPool } from "../db.js";
import { createSyncAuditService } from "./audit-adapter.js";

test.after(async () => {
  await closeDbPool();
});

describe("createSyncAuditService", () => {
  test("creates service with required methods", async () => {
    const mockPool = {
      query: async () => [[{ id: 1 }], []],
      execute: async () => [{ affectedRows: 1, insertId: 1 }],
      getConnection: async () => ({
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        execute: async () => [{ affectedRows: 1 }],
        release: () => {},
      }),
    };

    const service = createSyncAuditService(mockPool as unknown as Pool);

    assert.ok(service, "service should be created");
    assert.strictEqual(typeof service.startEvent, "function", "should have startEvent method");
    assert.strictEqual(typeof service.completeEvent, "function", "should have completeEvent method");
  });
});
```

---

## Files to Create/Modify

| Action | File | Notes |
|--------|------|-------|
| **CREATE** | `apps/api/src/lib/sync/audit-adapter.ts` | New adapter module |
| **CREATE** | `apps/api/src/lib/sync/audit-adapter.test.ts` | Unit tests with mocks |
| **MODIFY** | `apps/api/src/routes/sync/pull.ts` | Remove local function, add import |
| **MODIFY** | `apps/api/src/lib/sync/pull/index.ts` | Remove local function, add import |

---

## Verification Steps

```bash
# 1. TypeScript compilation
npm run typecheck -w @jurnapod/api

# 2. Run adapter tests
npm run test:unit:single -w @jurnapod/api "src/lib/sync/audit-adapter.test.ts"

# 3. Run sync pull tests
npm run test:unit:single -w @jurnapod/api "src/routes/sync/pull.test.ts"

# 4. Verify no duplication
grep -n "function createSyncAuditService" apps/api/src/routes/sync/pull.ts
# Should return nothing (function removed)

grep -n "function createSyncAuditService" apps/api/src/lib/sync/pull/index.ts
# Should return nothing (function removed)

# 5. Verify single source
grep -n "export function createSyncAuditService" apps/api/src/lib/sync/audit-adapter.ts
# Should show the function definition
```

---

## Acceptance Criteria

- [ ] `lib/sync/audit-adapter.ts` created with proper TypeScript types
- [ ] `lib/sync/audit-adapter.test.ts` created with mock-based tests
- [ ] `routes/sync/pull.ts` imports from library (no local implementation)
- [ ] `lib/sync/pull/index.ts` imports from library (no local implementation)
- [ ] No code duplication between files
- [ ] All TypeScript checks pass
- [ ] All tests pass

---

## Reference

**Analysis Document:** `_bmad-output/implementation-artifacts/stories/epic-13/sync-pull-analysis.md`

Key findings from analysis:
- Option B recommended: Extract to dedicated adapter module
- Eliminates duplication between route and library
- Provides single source of truth
- Follows Library Usage Rule

---

*Ready for implementation.*
