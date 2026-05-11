# Story 63.1 Completion Report: Fix sync-modules lifecycle mock → real integration test

**Story:** Fix sync-modules lifecycle mock → real integration test  
**Epic:** 63 - Test Production-Code Hardening  
**Status:** ✅ DONE  
**Completed:** 2026-05-10

---

## Summary

Converted the sync-modules lifecycle test from a fully-mocked unit test to a real integration test using production Kysely DB pool and real sync package imports. Eliminated the P0 blocker where `getDbPool()` returned `{ mocked: true }` and all 3 sync packages were replaced with in-test fake classes.

---

## Files

| Action | File |
|--------|------|
| Created | `apps/api/__test__/integration/sync/sync-modules.lifecycle.test.ts` |
| Deleted | `apps/api/__test__/unit/sync/sync-modules.lifecycle.test.ts` |

## Acceptance Criteria

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | Test uses real `getDbPool()` (not mock returning `{ mocked: true }`) | ✅ |
| AC2 | Test uses real `PosSyncModule`, `BackofficeSyncModule`, `sync-core` registry | ✅ |
| AC3 | Lifecycle functions tested against real infrastructure | ✅ 6/6 tests pass |
| AC4 | No `vi.mock()` calls remain | ✅ |
| AC5 | File at `integration/sync/sync-modules.lifecycle.test.ts` | ✅ |

## Test Results

```
Tests: 6 passed (6) — Duration: 2.31s
- Single-flight lazy init for concurrent getPosSyncModuleAsync calls
- Re-initializes after cleanup (no stale lazy promise)
- Cleanup clears registry state
- Double-cleanup is safe (idempotent)
- Cleanup when no module was initialized is safe
- Handles initializeSyncModules startup with real DB (both POS + Backoffice)
```

## Code Quality

| Check | Result |
|-------|--------|
| TypeScript | ✅ Passes |
| ESLint | ✅ Passes |
| Build | ✅ Successful |

## Dev Notes

- Uses canonical `beforeAll seedCtx` caching pattern (`getSeedSyncContext as loadSeedSyncContext`)
- `beforeEach` calls `cleanupSyncModules()` to reset module-level singleton state
- `afterAll` performs `resetFixtureRegistry()` + `closeTestDb()`
- Imports from `@/lib/sync-modules`, `@jurnapod/sync-core`, `../../fixtures`

---

**Story is COMPLETE.**
