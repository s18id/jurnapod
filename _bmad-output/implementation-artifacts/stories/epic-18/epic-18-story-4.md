# Story 18.4: Verify backoffice-sync DbConn usage

Status: ready-for-dev
Priority: P0
Epic: DbConn-Only Sync Architecture Migration - Phase 1

---

## Story

As a developer working on the backoffice-sync package,
I want to verify and fix the `initialize()` method to correctly receive and use `DbConn`,
so that the backoffice sync module complies with the DbConn-only standard.

## Context

The `packages/backoffice-sync/src/backoffice-sync-module.ts` file receives `context.database` in its `initialize()` method and passes it to:
1. `BackofficeDataService` constructor
2. `BatchProcessor` constructor
3. `ExportScheduler` constructor

Currently, `BackofficeDataService` accepts `context.database` as `DatabaseConnection` type. After story 18.1 changes `SyncModuleInitContext.database` to `DbConn`, we need to verify:
1. The type compatibility between `DbConn` and `DatabaseConnection`
2. Whether `BatchProcessor` and `ExportScheduler` need updates
3. If any casting or adapter code is needed

## Acceptance Criteria

1. **Type Analysis** (AC-1)
   - Check `DatabaseConnection` type definition in `backoffice-data-service.ts`
   - Verify if it's compatible with `DbConn` or needs updating
   - Document any type mismatches found

2. **Constructor Updates** (AC-2)
   - Update `BackofficeDataService` to accept `DbConn` if needed
   - Verify `BatchProcessor` accepts the database parameter correctly
   - Verify `ExportScheduler` accepts the database parameter correctly

3. **Implementation Fixes** (AC-3)
   - If `DatabaseConnection` is an interface/alias for `any`, update it to `DbConn`
   - If internal methods cast or wrap the database, clean them up
   - Ensure `context.database` is used directly as `DbConn`

4. **Verification** (AC-4)
   - `npm run typecheck -w @jurnapod/backoffice-sync` passes
   - `npm run build -w @jurnapod/backoffice-sync` succeeds
   - All backoffice-sync tests pass

## Tasks / Subtasks

- [ ] Task 1: Analyze DatabaseConnection type (AC-1)
  - [ ] Read `packages/backoffice-sync/src/core/backoffice-data-service.ts`
  - [ ] Find `DatabaseConnection` type definition
  - [ ] Compare with `DbConn` interface
- [ ] Task 2: Check BatchProcessor and ExportScheduler (AC-2)
  - [ ] Read `packages/backoffice-sync/src/batch/batch-processor.ts`
  - [ ] Read `packages/backoffice-sync/src/scheduler/export-scheduler.ts`
  - [ ] Check their constructor signatures
- [ ] Task 3: Apply type fixes (AC-3)
  - [ ] Update type definitions as needed
  - [ ] Remove any unnecessary casting
- [ ] Task 4: Verify build (AC-4)
  - [ ] Run typecheck
  - [ ] Run build
  - [ ] Run tests

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `packages/backoffice-sync/src/backoffice-sync-module.ts` | 38-46 | Verify database usage |
| `packages/backoffice-sync/src/core/backoffice-data-service.ts` | TBD | Update DatabaseConnection type |
| `packages/backoffice-sync/src/batch/batch-processor.ts` | TBD | Verify constructor accepts DbConn |
| `packages/backoffice-sync/src/scheduler/export-scheduler.ts` | TBD | Verify constructor accepts DbConn |

## Dev Notes

### Current State Analysis

In `backoffice-sync-module.ts`:
```typescript
async initialize(context: SyncModuleInitContext): Promise<void> {
  this.dataService = new BackofficeDataService(context.database);
  this.logger = context.logger;
  
  // Initialize batch processor
  this.batchProcessor = new BatchProcessor(context.database, this.batchProcessorConfig);
  
  // Initialize export scheduler
  this.exportScheduler = new ExportScheduler(context.database);
  // ...
}
```

Need to check what `DatabaseConnection` is defined as in `backoffice-data-service.ts`:
```bash
grep -n "DatabaseConnection" packages/backoffice-sync/src/core/backoffice-data-service.ts
```

### Potential Scenarios

**Scenario A: DatabaseConnection is `any`**
- Action: Change to `DbConn`
- Impact: May require updates to internal methods

**Scenario B: DatabaseConnection is already `DbConn`**
- Action: No change needed in backoffice-data-service.ts
- Verify other files still work

**Scenario C: DatabaseConnection is a custom interface**
- Action: Update interface to match `DbConn` or extend from it
- May need adapter code (try to avoid)

### BatchProcessor and ExportScheduler Checks

```bash
# Check BatchProcessor constructor
grep -A5 "constructor" packages/backoffice-sync/src/batch/batch-processor.ts

# Check ExportScheduler constructor
grep -A5 "constructor" packages/backoffice-sync/src/scheduler/export-scheduler.ts
```

### Dependencies
- **Blocker:** Story 18.1 must be complete (type update in sync-core)
- **Related:** Story 18.2 (API changes may affect initialization order)

### Testing Approach

1. **Type verification:**
   ```bash
   npm run typecheck -w @jurnapod/backoffice-sync
   ```

2. **Build verification:**
   ```bash
   npm run build -w @jurnapod/backoffice-sync
   ```

3. **Test execution:**
   ```bash
   npm test -w @jurnapod/backoffice-sync
   ```

4. **Integration check:**
   After all Phase 1 stories complete:
   ```bash
   npm run typecheck -w @jurnapod/api
   ```

## Definition of Done

- [ ] `DatabaseConnection` type is verified and compatible with `DbConn`
- [ ] `BatchProcessor` accepts database parameter correctly
- [ ] `ExportScheduler` accepts database parameter correctly
- [ ] `backoffice-sync-module.ts` uses `context.database` as `DbConn`
- [ ] TypeScript typecheck passes for backoffice-sync package
- [ ] Build succeeds for backoffice-sync package
- [ ] All backoffice-sync tests pass
- [ ] No runtime errors during module initialization

## References

- [Source: `packages/backoffice-sync/src/backoffice-sync-module.ts`]
- [Source: `packages/backoffice-sync/src/core/backoffice-data-service.ts`]
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
