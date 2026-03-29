# Story 18.2: Fix API sync-modules to pass real DbConn

Status: ready-for-dev
Priority: P0
Epic: DbConn-Only Sync Architecture Migration - Phase 1

---

## Story

As an API developer,
I want the sync module initialization to pass a real `DbConn` instance instead of a custom adapter,
so that sync modules receive proper database connections that comply with the DbConn-only standard.

## Context

The API currently creates a custom `databaseAdapter` object in `apps/api/src/lib/sync-modules.ts` that wraps `getDbPool()` with custom `query` and `querySingle` methods. This adapter is then passed to `syncModuleRegistry.initialize()`.

After story 18.1 updates `SyncModuleInitContext.database` to require `DbConn`, this adapter pattern will no longer be type-compatible. This story replaces the adapter with a proper `DbConn` instance.

## Acceptance Criteria

1. **Import Update** (AC-1)
   - Import `DbConn` from `@jurnapod/db` alongside existing `getDbPool` import
   - Import statement should be: `import { getDbPool, DbConn } from "@/lib/db";` (assuming re-export)
   - OR: `import { DbConn } from "@jurnapod/db";` if not re-exported from `@/lib/db`

2. **DbConn Instance Creation** (AC-2)
   - Create a `DbConn` instance from the pool: `const dbConn = new DbConn(dbPool);`
   - Pass `dbConn` to `syncModuleRegistry.initialize()` instead of `databaseAdapter`

3. **Adapter Removal** (AC-3)
   - Remove the `databaseAdapter` object definition (lines 21-36)
   - Optionally keep as a comment for reference during migration

4. **API Verification** (AC-4)
   - `npm run typecheck -w @jurnapod/api` passes
   - `npm run build -w @jurnapod/api` succeeds
   - All sync module tests pass

## Tasks / Subtasks

- [ ] Task 1: Add DbConn import (AC-1)
  - [ ] Check if `@/lib/db` exports `DbConn`, if not add `@jurnapod/db` import
  - [ ] Add import for `DbConn` class
- [ ] Task 2: Create DbConn instance (AC-2)
  - [ ] After `const dbPool = getDbPool();`, add `const dbConn = new DbConn(dbPool);`
  - [ ] Update `initialize()` call to use `database: dbConn`
- [ ] Task 3: Remove adapter code (AC-3)
  - [ ] Remove the `databaseAdapter` const and its methods
  - [ ] Clean up any related comments
- [ ] Task 4: Verify build and tests (AC-4)
  - [ ] Run typecheck for API package
  - [ ] Run build for API package
  - [ ] Run sync-related tests

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `apps/api/src/lib/sync-modules.ts` | 1-50 | Update imports, remove adapter, create DbConn |

## Dev Notes

### Current State
```typescript
// apps/api/src/lib/sync-modules.ts (lines 17-47)
const dbPool = getDbPool();

// Create database adapter for sync modules
const databaseAdapter = {
  async query(sql: string, params?: any[]): Promise<any[]> {
    const connection = await dbPool.getConnection();
    try {
      const [rows] = await connection.execute(sql, params);
      return Array.isArray(rows) ? rows : [];
    } finally {
      connection.release();
    }
  },

  async querySingle(sql: string, params?: any[]): Promise<any | null> {
    const results = await this.query(sql, params);
    return results[0] || null;
  }
};

// Initialize the sync module registry
await syncModuleRegistry.initialize({
  database: databaseAdapter,
  logger: console,
  config: { ... }
});
```

### Target State
```typescript
import { DbConn } from "@jurnapod/db"; // if needed

const dbPool = getDbPool();
const dbConn = new DbConn(dbPool);

// Initialize the sync module registry
await syncModuleRegistry.initialize({
  database: dbConn,
  logger: console,
  config: { ... }
});
```

### Import Check
First verify if `@/lib/db` exports `DbConn`:
```bash
grep -n "export.*DbConn" apps/api/src/lib/db.ts
```

If not exported, add the import from `@jurnapod/db`.

### Dependencies
- **Blocker:** Story 18.1 must be complete (type update in sync-core)
- `@jurnapod/db` must be available

### Potential Issues

1. **Type compatibility:** After story 18.1, the type will be `DbConn`. The adapter object won't match.

2. **Method differences:** The adapter had `query()` and `querySingle()` methods. `DbConn` has:
   - `query<T>(sql, params)` - returns `Promise<T[]>`
   - `querySingle<T>(sql, params)` - returns `Promise<T | null>`
   - `execute(sql, params)` - for mutations
   - `kysely` - for type-safe queries

3. **Pool lifecycle:** The `dbPool` from `getDbPool()` is a singleton. `DbConn` wraps it without changing lifecycle.

### Testing Approach

1. **Type verification:**
   ```bash
   npm run typecheck -w @jurnapod/api
   ```

2. **Build verification:**
   ```bash
   npm run build -w @jurnapod/api
   ```

3. **Test execution:**
   ```bash
   # Run sync-related tests
   npm run test:unit:single -w @jurnapod/api src/routes/sync/
   ```

4. **Integration test:**
   - Start API server
   - Verify sync modules initialize without errors
   - Check health endpoint: `GET /health` should show sync modules healthy

## Definition of Done

- [ ] `DbConn` is imported correctly
- [ ] `databaseAdapter` wrapper is removed
- [ ] `DbConn` instance is created from `getDbPool()`
- [ ] `syncModuleRegistry.initialize()` receives `database: dbConn`
- [ ] TypeScript typecheck passes for API package
- [ ] Build succeeds for API package
- [ ] Sync module tests pass
- [ ] No runtime errors during API startup

## References

- [Source: `apps/api/src/lib/sync-modules.ts`]
- [Source: `packages/db/src/mysql-client.ts` - DbConn class]
- [Depends: Story 18.1 - Update sync-core types to accept DbConn]

---

## Dev Agent Record

### Agent Model Used

<!-- To be filled by dev agent -->

### Debug Log References

<!-- To be filled by dev agent -->

### Completion Notes List

<!-- To be filled by dev agent -->

### Files Modified

<!-- To be filled by dev agent -->

### Test Evidence

<!-- To be filled by dev agent -->
