# Story 18.3: Clean up pos-sync dead import

Status: ready-for-dev
Priority: P0
Epic: DbConn-Only Sync Architecture Migration - Phase 1

---

## Story

As a developer maintaining the pos-sync package,
I want to remove the unused `createDbPool` import,
so that the codebase is clean and doesn't import symbols that are never used.

## Context

The `packages/pos-sync/src/pos-sync-module.ts` file imports `createDbPool` from `@jurnapod/db` on line 15, but this import is never used in the file. The module receives its database connection through `SyncModuleInitContext.database` instead.

This is a cleanup task that should be done as part of the DbConn-only migration to ensure the package only imports what it actually uses.

## Acceptance Criteria

1. **Dead Import Removal** (AC-1)
   - Remove `createDbPool` from the import on line 15
   - Keep the `DbConn` import as it is used for type casting
   - Ensure import statement reads: `import { DbConn } from "@jurnapod/db";`

2. **Import Verification** (AC-2)
   - Verify no other dead imports exist in the file
   - Check all imported symbols are actually used:
     - `SyncModule`, `SyncEndpoint`, etc. from `@jurnapod/sync-core` - used
     - `syncAuditor` from `@jurnapod/sync-core` - used
     - `PosDataService`, `DatabaseConnection` from `./core/pos-data-service.js` - used
     - `createPosSyncEndpoints` from `./endpoints/pos-sync-endpoints.js` - used
     - `DbConn` from `@jurnapod/db` - used (for casting)
     - `handlePullSync` types from `./pull/index.js` - used
     - `handlePushSync` types from `./push/index.js` - used

3. **Build Verification** (AC-3)
   - `npm run typecheck -w @jurnapod/pos-sync` passes
   - `npm run build -w @jurnapod/pos-sync` succeeds
   - No lint errors

## Tasks / Subtasks

- [ ] Task 1: Remove dead import (AC-1)
  - [ ] Edit line 15 to remove `createDbPool`
- [ ] Task 2: Verify remaining imports (AC-2)
  - [ ] Check each imported symbol is used
  - [ ] Document any other dead imports found
- [ ] Task 3: Run checks (AC-3)
  - [ ] TypeScript typecheck
  - [ ] Build
  - [ ] Lint

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `packages/pos-sync/src/pos-sync-module.ts` | 15 | Remove `createDbPool` from import |

## Dev Notes

### Current State
```typescript
// packages/pos-sync/src/pos-sync-module.ts (line 15)
import { createDbPool, DbConn } from "@jurnapod/db";
```

### Target State
```typescript
// packages/pos-sync/src/pos-sync-module.ts (line 15)
import { DbConn } from "@jurnapod/db";
```

### Usage Check

Run this to verify `createDbPool` is unused:
```bash
grep -n "createDbPool" packages/pos-sync/src/pos-sync-module.ts
```

Expected: Only the import line should match.

### Dependencies
- None - this is a standalone cleanup task
- Can be done in parallel with stories 18.1 and 18.2
- Should be done before story 18.4 (verification)

### Type Casting Note
The `DbConn` import is currently used on line 40 for type casting:
```typescript
this.dbConn = context.database as DbConn;
```

After story 18.1, this cast may become unnecessary since `context.database` will already be `DbConn`. However, keep the cast for now - removing it can be part of a future cleanup.

### Testing Approach

1. **Type verification:**
   ```bash
   npm run typecheck -w @jurnapod/pos-sync
   ```

2. **Build verification:**
   ```bash
   npm run build -w @jurnapod/pos-sync
   ```

3. **Lint check:**
   ```bash
   npm run lint -w @jurnapod/pos-sync
   ```

4. **Test execution:**
   ```bash
   npm test -w @jurnapod/pos-sync
   ```

## Definition of Done

- [ ] `createDbPool` is removed from imports
- [ ] `DbConn` import is preserved
- [ ] No other dead imports found in the file
- [ ] TypeScript typecheck passes
- [ ] Build succeeds
- [ ] Lint passes
- [ ] Tests pass (if any affected)

## References

- [Source: `packages/pos-sync/src/pos-sync-module.ts`]
- [Related: `packages/pos-sync/AGENTS.md` - Package conventions]

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
