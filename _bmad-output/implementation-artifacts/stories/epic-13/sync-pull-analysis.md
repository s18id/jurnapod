# Sync Pull Architecture Analysis

**Story 13.6: Analyze `sync/pull.ts` Architecture**  
**Analysis Date:** March 28, 2026  
**Analyst:** BMAD Architect  
**Document Path:** `_bmad-output/implementation-artifacts/stories/epic-13/sync-pull-analysis.md`

---

## 1. Executive Summary

This analysis evaluates the custom database adapter pattern used in `apps/api/src/routes/sync/pull.ts` for creating a `SyncAuditService` instance. The adapter bridges the gap between the mysql2 `Pool` interface and the `AuditDbClient` interface expected by the `@jurnapod/modules-platform/sync` module.

**Key Finding:** The current pattern has **duplicated code** between `routes/sync/pull.ts` (lines 53-84) and `lib/sync/pull/index.ts` (lines 105-138). The adapter logic exists in both places with slight variations.

**Recommendation:** Adopt **Option B** - Extract the adapter to `lib/sync/audit-adapter.ts` as a reusable, well-typed module. This provides the best balance of:
- Code consolidation (eliminates duplication)
- Clear separation of concerns
- Future compatibility with Kysely migration
- Minimal complexity overhead

---

## 2. Current Architecture

### 2.1 AuditDbClient Interface

The `AuditDbClient` interface is defined in `packages/modules/platform/src/sync/audit-service.ts` (lines 49-65):

```typescript
export interface AuditDbClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(
    sql: string,
    params?: unknown[]
  ): Promise<{ affectedRows: number; insertId?: number }>;
  getConnection?(): Promise<{
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    execute(
      sql: string,
      params?: unknown[]
    ): Promise<{ affectedRows: number; insertId?: number }>;
    release(): void;
  }>;
}
```

**Key characteristics:**
- Generic interface for dependency injection
- Supports both direct queries and transactional operations
- Optional `getConnection()` for transaction support (required for archive operations)
- Decoupled from specific database driver implementations

### 2.2 Current Adapter Implementation (routes/sync/pull.ts)

Located in `apps/api/src/routes/sync/pull.ts` (lines 53-84):

```typescript
function createSyncAuditService(dbPool: ReturnType<typeof getDbPool>): SyncAuditService {
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

### 2.3 Duplicated Implementation (lib/sync/pull/index.ts)

A near-identical implementation exists in `apps/api/src/lib/sync/pull/index.ts` (lines 105-138):

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbPool = any;

export function createSyncAuditService(dbPool: DbPool): SyncAuditService {
  const { SyncAuditService } = require("@jurnapod/modules-platform/sync");
  
  const client: AuditDbClient = {
    // ... identical implementation
  };
  return new SyncAuditService(client);
}
```

**Issues with the lib version:**
- Uses `any` type for `DbPool` (line 100)
- Uses `require()` instead of ESM import (line 106)
- Functionally identical to the route version

### 2.4 Why This Adapter Is Needed

The `SyncAuditService` from `@jurnapod/modules-platform/sync` is designed to be database-agnostic. It accepts an `AuditDbClient` interface rather than a direct mysql2 pool dependency. This provides:

1. **Testability**: Can inject mock clients for unit testing
2. **Portability**: Could work with other database drivers
3. **Modularity**: The sync module is decoupled from the API's database infrastructure

However, the API uses mysql2's Promise-based pool directly, which has a different API than `AuditDbClient`. The adapter bridges this gap.

---

## 3. Requirements Analysis

### 3.1 Functional Requirements

| Requirement | Priority | Notes |
|------------|----------|-------|
| Wrap mysql2 Pool to AuditDbClient | P0 | Core functionality |
| Support connection pooling | P0 | For high-concurrency sync operations |
| Support transactions | P1 | Required for `archiveEvents()` operation |
| Type safety | P1 | Eliminate `any` types |
| Single implementation | P1 | Eliminate duplication |
| Testability | P2 | Enable mock injection |

### 3.2 Non-Functional Requirements

| Requirement | Priority | Notes |
|------------|----------|-------|
| Zero runtime overhead | P1 | Adapter should be thin wrapper |
| Kysely compatibility | P2 | Should work with future Kysely migration |
| Clear error messages | P2 | Preserve original mysql2 error info |

### 3.3 Cross-Cutting Concerns

**Kysely Migration Context:**
The codebase is actively migrating to Kysely ORM (Epic 1, Epic 2). The existing `JurnapodDbClient` interface (`packages/db/src/jurnapod-client.ts`) already provides a unified contract:

```typescript
export interface JurnapodDbClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<SqlExecuteResult>;
  begin?(): Promise<void>;
  commit?(): Promise<void>;
  rollback?(): Promise<void>;
  readonly kysely: Kysely<DB>;
}
```

**Key insight**: `AuditDbClient` and `JurnapodDbClient` serve similar purposes but with different method signatures. A future unification may be possible but is out of scope for Epic 13.

---

## 4. Options Evaluation

### 4.1 Option A: Keep in Route

**Description:** Leave the `createSyncAuditService` function in `routes/sync/pull.ts` and remove the duplicate from `lib/sync/pull/index.ts`.

**Pros:**
- Minimal change required
- No new files to manage
- Works immediately

**Cons:**
- SQL-adjacent code remains in route (violates Library Usage Rule from AGENTS.md)
- Not reusable if other routes need sync audit
- Code duplication still exists between route and lib
- Harder to test in isolation

**Verdict:** ❌ **Not recommended** - Doesn't address core architectural issues.

---

### 4.2 Option B: Extract to lib/sync/audit-adapter.ts ⭐ RECOMMENDED

**Description:** Create a dedicated adapter module at `apps/api/src/lib/sync/audit-adapter.ts` that exports the adapter factory function.

**Pros:**
- Single source of truth (eliminates duplication)
- Clear separation of concerns
- Reusable across sync routes
- Easy to test in isolation
- Follows Library Usage Rule (routes stay thin)
- Simple and focused scope

**Cons:**
- Single-purpose module (but this is acceptable)
- Still uses raw SQL (but this is intentional per Epic 2 decisions)

**Implementation sketch:**
```typescript
// lib/sync/audit-adapter.ts
import type { Pool } from "mysql2/promise";
import { SyncAuditService, type AuditDbClient } from "@jurnapod/modules-platform/sync";

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

**Verdict:** ✅ **RECOMMENDED** - Best balance of simplicity and correctness.

---

### 4.3 Option C: Generic Adapter in lib/db/adapter.ts

**Description:** Create a generic adapter factory in `lib/db/adapter.ts` that can adapt any mysql2 Pool to any interface.

**Pros:**
- Potentially reusable for other adapters
- Consistent pattern across codebase

**Cons:**
- Over-engineered for current needs
- Adds complexity without clear benefit
- AuditDbClient has specific requirements (transaction support)
- YAGNI - we only have one adapter need currently

**Verdict:** ❌ **Not recommended** - Premature abstraction.

---

### 4.4 Option D: Use Existing DbConn/Kysely

**Description:** Modify `SyncAuditService` to accept `JurnapodDbClient` instead of `AuditDbClient`, or create a Kysely-based adapter.

**Pros:**
- Aligns with ORM migration
- Leverages existing infrastructure

**Cons:**
- Requires changes to `@jurnapod/modules-platform/sync` package
- `AuditDbClient` and `JurnapodDbClient` have different signatures
- Significant refactoring outside Epic 13 scope
- Raw SQL is intentional for sync audit (simple INSERT/UPDATE patterns)

**Verdict:** ❌ **Not recommended** - Out of scope, interface mismatch.

---

## 5. Recommendation

### 5.1 Primary Recommendation: Option B

**Adopt Option B** - Extract the adapter to `apps/api/src/lib/sync/audit-adapter.ts`.

**Rationale:**
1. **Eliminates duplication**: The same adapter logic exists in two places
2. **Follows established patterns**: `lib/sync/push/` already contains sync-specific libraries
3. **Respects Library Usage Rule**: Routes should not contain SQL-adjacent logic
4. **Simple and focused**: Single-purpose module with clear responsibility
5. **Testable**: Can be unit tested in isolation
6. **Kysely-compatible**: Can be extended later if needed without breaking changes

### 5.2 Implementation Approach for Story 13.7

**Files to modify/create:**

1. **Create:** `apps/api/src/lib/sync/audit-adapter.ts`
   - Export `createSyncAuditService(dbPool: Pool): SyncAuditService`
   - Proper TypeScript types (no `any`)
   - JSDoc documentation

2. **Modify:** `apps/api/src/routes/sync/pull.ts`
   - Remove local `createSyncAuditService` function (lines 53-84)
   - Import from `lib/sync/audit-adapter.js`
   - Remove export of `createSyncAuditService` (line 216)

3. **Modify:** `apps/api/src/lib/sync/pull/index.ts`
   - Remove local `createSyncAuditService` function (lines 99-138)
   - Import from `../audit-adapter.js`
   - Update `orchestrateSyncPull` to use shared adapter

4. **Create:** `apps/api/src/lib/sync/audit-adapter.test.ts`
   - Unit tests for adapter functions
   - Mock pool/connection testing

### 5.3 Acceptance Criteria for Story 13.7

- [ ] `apps/api/src/lib/sync/audit-adapter.ts` created with proper types
- [ ] `routes/sync/pull.ts` imports adapter (no local implementation)
- [ ] `lib/sync/pull/index.ts` imports adapter (no local implementation)
- [ ] No code duplication between route and library
- [ ] Unit tests for adapter created and passing
- [ ] Existing sync pull tests continue to pass
- [ ] TypeScript compilation successful (`npm run typecheck -w @jurnapod/api`)

---

## 6. Implementation Notes for Story 13.7

### 6.1 Type Safety Considerations

The current implementation uses type assertions:
```typescript
params as (string | number | Date | null)[]
```

This is acceptable because:
1. mysql2's `query()` and `execute()` accept `any[]` for parameters
2. The caller (SyncAuditService) provides properly typed values
3. Zod validation at API boundaries ensures data integrity

### 6.2 Connection Lifecycle

The adapter's `getConnection()` returns a wrapper that:
1. Acquires a connection from the pool
2. Wraps it with transaction methods
3. Must be released by caller (via `release()`)

This matches mysql2's connection lifecycle and is used by `SyncAuditService.archiveEvents()`.

### 6.3 Testing Strategy

**Unit tests for adapter:**
```typescript
// audit-adapter.test.ts
import { describe, test, expect, vi } from "vitest";
import { createSyncAuditService } from "./audit-adapter.js";

describe("createSyncAuditService", () => {
  test("creates service with query method", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue([[{ id: 1 }], []]),
    };
    const service = createSyncAuditService(mockPool as unknown as Pool);
    expect(service).toBeDefined();
  });
  
  // Additional tests for execute, getConnection...
});
```

### 6.4 Future Kysely Compatibility

If Kysely migration extends to sync audit operations:

1. The adapter can remain as-is (raw SQL is fine for simple audit INSERTs)
2. Or, create a new `createKyselyAuditService(kysely: Kysely<DB>)` function
3. Both can coexist - the interface abstraction allows this

### 6.5 Alternative: Adapter Factory Pattern

For even more flexibility, consider a factory pattern:

```typescript
// audit-adapter.ts
export interface AuditAdapterFactory {
  createAuditService(pool: Pool): SyncAuditService;
}

export const mysql2AuditAdapter: AuditAdapterFactory = {
  createAuditService(pool) {
    // ... implementation
  }
};
```

This is **optional** - the simple function export is sufficient for current needs.

---

## 7. Summary

| Aspect | Current State | Recommended State |
|--------|--------------|-------------------|
| Adapter location | Duplicated in route + lib | Single module: `lib/sync/audit-adapter.ts` |
| Type safety | Mixed (some `any`) | Full TypeScript types |
| Reusability | Low (duplicated) | High (single export) |
| Testability | Hard (embedded in routes) | Easy (isolated module) |
| Architecture | Violates Library Usage Rule | Follows Library Usage Rule |

**Next Steps:**
1. Proceed with Story 13.7 using **Option B** (Extract to lib/sync/audit-adapter.ts)
2. Remove duplicate implementations from route and lib/pull
3. Add unit tests for the adapter
4. Verify all existing tests pass

---

## Appendix A: File References

| File | Purpose |
|------|---------|
| `apps/api/src/routes/sync/pull.ts` | Route with embedded adapter (lines 53-84) |
| `apps/api/src/lib/sync/pull/index.ts` | Lib with duplicate adapter (lines 99-138) |
| `packages/modules/platform/src/sync/audit-service.ts` | AuditDbClient interface definition |
| `packages/db/src/jurnapod-client.ts` | JurnapodDbClient interface (related) |
| `packages/db/src/connection-kysely.ts` | Kysely connection helper |

## Appendix B: Related Stories

| Story | Description | Relationship |
|-------|-------------|--------------|
| 13.7 | Create sync pull adapter | **Depends on this analysis** |
| 13.8 | Epic 13 documentation | Should reference this analysis |
| 2.3 | Sync Push Kysely Migration | Established sync lib patterns |
| 2.4 | Sync Pull Kysely Migration | Migrated master-data.ts to Kysely |
