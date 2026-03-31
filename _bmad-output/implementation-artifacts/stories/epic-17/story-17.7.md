# Story 17-7: Delete lib/sync/ and Its Tests

Status: ready-for-dev
Priority: P0
Epic: Resurrect Sync-Core (Sync Module Architecture)

---

## Story

As a developer cleaning up technical debt,
I want to remove the `apps/api/src/lib/sync/` directory and all its tests,
so that the codebase has a single source of truth for sync logic (pos-sync package) and eliminates dead code.

## Context

Once Story 17-6 is complete, the API routes will have been refactored to be thin adapters that delegate to the `pos-sync` package. At that point, the `lib/sync/` directory becomes dead code:

- All push sync logic has moved to `packages/pos-sync/src/push/`
- All pull sync logic has moved to `packages/pos-sync/src/pull/`
- The orchestrator (`lib/sync/push/index.ts`) is no longer called by routes
- All types have been duplicated/refactored into pos-sync types

This story is safe to execute only after:
1. Story 17-6 is complete (routes refactored)
2. Feature flag `PUSH_SYNC_MODE` is at 100% (all traffic uses new path)
3. No rollback expected (monitoring shows new path is stable)

## Acceptance Criteria

1. **Directory Removal** (AC-1)
   - Delete `apps/api/src/lib/sync/` directory entirely
   - Delete all subdirectories: `push/`, `pull/`
   - Delete all files: `*.ts`, `*.test.ts`, `*.md`

2. **Import Cleanup** (AC-2)
   - Remove all imports from `lib/sync/` in route files
   - Remove all imports from `lib/sync/` in test files
   - Remove any barrel exports or re-exports

3. **Test Cleanup** (AC-3)
   - Delete `apps/api/src/lib/sync/check-duplicate.test.ts`
   - Delete `apps/api/src/lib/sync/audit-adapter.test.ts`
   - Ensure no test files reference deleted modules

4. **Configuration Cleanup** (AC-4)
   - Remove any Jest/vitest config entries for lib/sync tests
   - Update any tsconfig paths if needed
   - Clean up any CI/CD references to deleted tests

5. **Verification** (AC-5)
   - `npm run typecheck -w @jurnapod/api` passes
   - `npm run build -w @jurnapod/api` succeeds
   - `npm run test:unit -w @jurnapod/api` passes
   - All sync-related integration tests pass

## Tasks / Subtasks

- [ ] Task 1: Verify preconditions (AC-1)
  - [ ] Confirm Story 17-6 is complete
  - [ ] Confirm feature flag at 100%
  - [ ] Run full test suite as baseline
- [ ] Task 2: Delete lib/sync directory (AC-1)
  - [ ] Delete `apps/api/src/lib/sync/push/`
  - [ ] Delete `apps/api/src/lib/sync/pull/`
  - [ ] Delete `apps/api/src/lib/sync/*.ts` files
- [ ] Task 3: Clean up imports (AC-2)
  - [ ] Search for any remaining imports from `lib/sync/`
  - [ ] Update or remove import statements
- [ ] Task 4: Update test configuration (AC-3, AC-4)
  - [ ] Remove deleted test files from test configs
  - [ ] Verify no test references remain
- [ ] Task 5: Verify build and tests (AC-5)
  - [ ] Run typecheck
  - [ ] Run build
  - [ ] Run unit tests
  - [ ] Run sync integration tests

## Files to Delete

| File | Size | Description |
|------|------|-------------|
| `apps/api/src/lib/sync/push/index.ts` | ~392 lines | Push orchestrator (replaced by pos-sync) |
| `apps/api/src/lib/sync/push/types.ts` | ~400 lines | Push types (replaced by pos-sync) |
| `apps/api/src/lib/sync/push/transactions.ts` | ~900 lines | Transaction processing (replaced by pos-sync) |
| `apps/api/src/lib/sync/push/orders.ts` | ~400 lines | Order processing (replaced by pos-sync) |
| `apps/api/src/lib/sync/push/stock.ts` | ~200 lines | Stock operations (replaced by pos-sync) |
| `apps/api/src/lib/sync/push/idempotency.ts` | ~150 lines | Idempotency logic (replaced by pos-sync) |
| `apps/api/src/lib/sync/push/variant-sales.ts` | ~400 lines | Variant sales (replaced by pos-sync) |
| `apps/api/src/lib/sync/push/variant-stock-adjustments.ts` | ~200 lines | Stock adjustments (replaced by pos-sync) |
| `apps/api/src/lib/sync/pull/index.ts` | ~100 lines | Pull orchestrator (replaced by pos-sync) |
| `apps/api/src/lib/sync/pull/types.ts` | ~50 lines | Pull types (replaced by pos-sync) |
| `apps/api/src/lib/sync/audit-adapter.ts` | ~100 lines | Audit adapter (replaced by pos-sync) |
| `apps/api/src/lib/sync/master-data.ts` | ~900 lines | Master data sync (replaced by pos-sync) |
| `apps/api/src/lib/sync/check-duplicate.ts` | ~100 lines | Duplicate check (replaced by pos-sync) |
| `apps/api/src/lib/sync/audit-adapter.test.ts` | ~100 lines | Audit adapter tests |
| `apps/api/src/lib/sync/check-duplicate.test.ts` | ~300 lines | Duplicate check tests |

**Total lines deleted: ~4,000+**

## Dev Notes

### Pre-Deletion Checklist

Before executing this story, verify:

```bash
# 1. Story 17-6 is complete
# - routes/sync/push.ts refactored
# - routes/sync/pull.ts refactored

# 2. Feature flag at 100%
grep -r "PUSH_SYNC_MODE" apps/api/src/ || echo "No feature flag references found"

# 3. No imports from lib/sync
grep -r "from.*lib/sync" apps/api/src/ || echo "No imports found"
grep -r "from.*\/sync\/" apps/api/src/ || echo "No imports found"

# 4. All tests pass
npm run test:unit -w @jurnapod/api
```

### Files Currently in lib/sync/

```
apps/api/src/lib/sync/
├── audit-adapter.test.ts
├── audit-adapter.ts
├── check-duplicate.test.ts
├── check-duplicate.ts
├── master-data.ts
├── pull/
│   ├── index.ts
│   └── types.ts
└── push/
    ├── idempotency.ts
    ├── index.ts
    ├── orders.ts
    ├── stock.ts
    ├── transactions.ts
    ├── types.ts
    ├── variant-sales.ts
    └── variant-stock-adjustments.ts
```

### Migration Path

| lib/sync Function | pos-sync Replacement |
|-------------------|----------------------|
| `orchestrateSyncPush()` | `posSyncModule.handlePushSync()` |
| `processSyncPushTransaction()` | `push/index.ts` internal |
| `processActiveOrders()` | `push/index.ts` internal |
| `processOrderUpdates()` | `push/index.ts` internal |
| `processItemCancellations()` | `push/index.ts` internal |
| `processVariantSales()` | `push/index.ts` internal |
| `processVariantStockAdjustments()` | `push/index.ts` internal |
| `resolveBatchIdempotencyCheck()` | `syncIdempotencyService` |
| `orchestrateSyncPull()` | `posSyncModule.handlePullSync()` |
| `masterData.ts` functions | `core/pos-data-service.ts` |

### Safety Measures

1. **Git commit before deletion**: Ensure all work is committed before deleting
2. **Full test run**: Run complete test suite before and after deletion
3. **Staged rollout**: Verify feature flag has been at 100% for at least 1 week
4. **Backup plan**: Keep commit hash for easy revert if needed

### Rollback Procedure (if needed)

If issues are discovered after deletion:

```bash
# Revert the deletion commit
git revert <deletion-commit-hash>

# Or restore from branch
git checkout <backup-branch> -- apps/api/src/lib/sync/
```

## Definition of Done

- [ ] `apps/api/src/lib/sync/` directory completely removed
- [ ] All imports from `lib/sync/` cleaned up
- [ ] All test files referencing lib/sync updated or removed
- [ ] No build errors (`npm run build -w @jurnapod/api`)
- [ ] No type errors (`npm run typecheck -w @jurnapod/api`)
- [ ] All tests pass (`npm run test:unit -w @jurnapod/api`)
- [ ] Sync integration tests pass
- [ ] Documentation updated (remove references to deleted code)
- [ ] Git commit with clear message about deletion

## Dependencies

- Story 17-6: Refactor API routes as thin adapters (MUST be complete)
- Feature flag `PUSH_SYNC_MODE` at 100% for at least 1 week
- No active rollback expected

## Risks

| Risk | Mitigation |
|------|------------|
| Accidental deletion of wrong files | Code review, verify file list before deletion |
| Hidden dependencies | Run full grep search before deletion |
| Test failures after deletion | Run full test suite, fix issues before committing |
| Need to rollback | Keep recent commit hash, use git revert if needed |

## References

- [Source: `apps/api/src/lib/sync/`]
- [Source: `apps/api/src/routes/sync/push.ts`]
- [Source: `apps/api/src/routes/sync/pull.ts`]
- [Source: `packages/pos-sync/src/`]
- [Related: Story 17-6 - Refactor API routes as thin adapters]

---

## Dev Agent Record

### Agent Model Used

<!-- To be filled by dev agent -->

### Debug Log References

<!-- To be filled by dev agent -->

### Completion Notes List

<!-- To be filled by dev agent -->

### Files Deleted

<!-- To be filled by dev agent -->

### Test Evidence

<!-- To be filled by dev agent -->
