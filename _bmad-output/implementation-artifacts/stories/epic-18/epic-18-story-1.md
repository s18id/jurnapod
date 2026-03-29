# Story 18.1: Update sync-core types to accept DbConn

Status: ready-for-dev
Priority: P0
Epic: DbConn-Only Sync Architecture Migration - Phase 1

---

## Story

As a developer working on the sync architecture,
I want the `SyncModuleInitContext.database` field to be properly typed as `DbConn`,
so that sync modules receive type-safe database connections and the codebase enforces the DbConn-only standard.

## Context

The sync-core package currently defines `SyncModuleInitContext.database` as `any` (line 61 in `packages/sync-core/src/types/module.ts`). This is a type safety gap that allows incorrect database adapters to be passed to sync modules.

The DbConn-only standard (defined in `packages/db/AGENTS.md`) requires all database access to use `DbConn` from `@jurnapod/db`. This story is the foundation for Phase 1 of the migration - fixing the type contract so that subsequent changes can rely on proper typing.

## Acceptance Criteria

1. **Type Import** (AC-1)
   - Import `DbConn` from `@jurnapod/db` at the top of `packages/sync-core/src/types/module.ts`
   - Use `import type { DbConn } from "@jurnapod/db"` for type-only import

2. **Type Update** (AC-2)
   - Change `SyncModuleInitContext.database` from `any` to `DbConn`
   - Remove the comment `// Database connection pool` as it's now self-documenting

3. **Related Type Updates** (AC-3)
   - Check if `DatabaseConnection` type alias in `pos-data-service.ts` or `backoffice-data-service.ts` needs alignment
   - Ensure no other `any` types in the file should be `DbConn`

4. **Build Verification** (AC-4)
   - `npm run typecheck -w @jurnapod/sync-core` passes
   - `npm run build -w @jurnapod/sync-core` succeeds

## Tasks / Subtasks

- [ ] Task 1: Add DbConn type import (AC-1)
  - [ ] Add `import type { DbConn } from "@jurnapod/db";` after existing imports
- [ ] Task 2: Update SyncModuleInitContext interface (AC-2)
  - [ ] Change `database: any;` to `database: DbConn;`
  - [ ] Remove or update the comment on line 61
- [ ] Task 3: Verify related types (AC-3)
  - [ ] Check `DatabaseConnection` type usage in dependent packages
  - [ ] Note any breaking changes for dependent stories
- [ ] Task 4: Run type checks (AC-4)
  - [ ] Execute typecheck for sync-core package
  - [ ] Execute build for sync-core package

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `packages/sync-core/src/types/module.ts` | 1-65 | Add import, update type |

## Dev Notes

### Current State
```typescript
// packages/sync-core/src/types/module.ts (line 60-65)
export interface SyncModuleInitContext {
  database: any; // Database connection pool
  logger: any;   // Logger instance
  config: Record<string, any>; // Environment config
  cache?: any;   // Optional cache instance
}
```

### Target State
```typescript
import type { DbConn } from "@jurnapod/db";

export interface SyncModuleInitContext {
  database: DbConn;
  logger: any;
  config: Record<string, any>;
  cache?: any;
}
```

### Dependencies
- `@jurnapod/db` must be available and built
- This story is a **blocker** for stories 18.2, 18.3, and 18.4

### Breaking Changes
This change will affect:
- `apps/api/src/lib/sync-modules.ts` - currently passes a custom adapter object
- `packages/pos-sync/src/pos-sync-module.ts` - already casts to DbConn, needs cleanup
- `packages/backoffice-sync/src/backoffice-sync-module.ts` - uses context.database directly

These breaking changes are intentionally left for subsequent stories to keep each change focused and reviewable.

### Testing Approach

1. **Type-level verification:**
   ```bash
   npm run typecheck -w @jurnapod/sync-core
   ```

2. **Build verification:**
   ```bash
   npm run build -w @jurnapod/sync-core
   ```

3. **Downstream impact check (optional):**
   ```bash
   npm run typecheck -w @jurnapod/pos-sync
   npm run typecheck -w @jurnapod/backoffice-sync
   npm run typecheck -w @jurnapod/api
   ```
   (These will likely fail until stories 18.2-18.4 are complete - that's expected)

## Definition of Done

- [ ] `DbConn` type is imported from `@jurnapod/db`
- [ ] `SyncModuleInitContext.database` is typed as `DbConn` (not `any`)
- [ ] TypeScript typecheck passes for sync-core package
- [ ] Build succeeds for sync-core package
- [ ] No other changes to sync-core package (keep scope minimal)
- [ ] Breaking changes in dependent packages documented in completion notes

## References

- [Source: `packages/sync-core/src/types/module.ts`]
- [Source: `packages/db/AGENTS.md` - DbConn-Only Standard]
- [Related: Epic 17 - Resurrect Sync-Core]

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
