# story-27.2: Replace API POS-sale posting with modules-accounting

## Description

Wire `apps/api/src/lib/sync-push-posting.ts` to `modules-accounting`'s `runSyncPushPostingHook`. The API file (791 LOC) is a duplicate of the package version — this story replaces its usage with the package and deletes the duplicate.

## Context

**Duplicate situation:**
- `apps/api/src/lib/sync-push-posting.ts` — API-local copy (791 LOC)
- `packages/modules/accounting/src/posting/sync-push.ts` — canonical version in package (496 LOC)

The API version has some superset behaviors. Before deleting the API copy, we must confirm the package version has parity. The package version must be the source of truth going forward.

**Source:** `apps/api/src/lib/sync-push-posting.ts` lines 1–791

## Acceptance Criteria

- [x] Package `runSyncPushPostingHook` has feature parity with API version (compare behaviors)
- [x] If gaps found: port missing behaviors to package version (not the reverse)
- [x] API callers updated to use `modules-accounting` directly
- [x] `apps/api/src/lib/sync-push-posting.ts` deleted
- [x] `npm run typecheck -w @jurnapod/modules-accounting`
- [x] `npm run build -w @jurnapod/modules-accounting`
- [x] `npm run typecheck -w @jurnapod/api`
- [x] `npm run build -w @jurnapod/api`
- [x] `npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts` (or existing push test)

## Files to Modify

```
packages/modules/accounting/src/posting/sync-push.ts   (no changes needed - package is superset)
apps/api/src/lib/sync-push-posting.ts                 (DELETE)
apps/api/src/lib/sync/push/transactions.ts             (update import + pass executor)
apps/api/src/lib/sync/push/posting-executor.ts         (CREATE - executor implementation)
```

## Dependency

- `story-27.2` → `story-27.1` (type contracts must be in place before wiring)

## Implementation Notes

### Step 1: Feature parity check
Read both files side-by-side. Compare:
- Account mapping logic (order of precedence for `account_id` resolution)
- Tax split logic (`tax_behavior`, split calculations)
- Disabled/shadow/active mode handling
- Defaulting logic for missing fields
- Any behavior in API not present in package

**Result:** Package is SUPERSET - no porting needed. Package includes `TAX_ALLOCATION_IMBALANCE` guard that API version lacks.

### Step 2: Port missing behaviors to package (if needed)
No gaps found - package already has all API behaviors plus additional `TAX_ALLOCATION_IMBALANCE` guard.

### Step 3: Update API caller
Updated `transactions.ts` to:
- Import `runSyncPushPostingHook` from `@jurnapod/modules-accounting`
- Import `KyselyPosSyncPushPostingExecutor` from `./posting-executor.js`
- Create executor instance and pass to `runSyncPushPostingHook`

### Step 4: Delete duplicate
Deleted `apps/api/src/lib/sync-push-posting.ts`

## Validation Commands

```bash
npm run typecheck -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-accounting
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts
```

## Validation Results

All validation commands passed:
- ✅ `npm run typecheck -w @jurnapod/modules-accounting` - PASS
- ✅ `npm run build -w @jurnapod/modules-accounting` - PASS
- ✅ `npm run typecheck -w @jurnapod/api` - PASS
- ✅ `npm run build -w @jurnapod/api` - PASS
- ✅ `npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts` - 34 tests PASS

## Parity Comparison Result

| Feature | API Version | Package Version | Status |
|---------|-------------|-----------------|--------|
| Account mapping logic | Inline SQL, outlet overrides company | Via executor interface | ✅ Parity |
| Tax split logic | Same split calculation | Same + `TAX_ALLOCATION_IMBALANCE` guard | ✅ Package superset |
| Disabled/shadow/active mode | Same | Same | ✅ Parity |
| Defaulting logic | Same | Same | ✅ Parity |
| `TAX_ALLOCATION_IMBALANCE` guard | Missing | Present | ⚠️ API missing |

**Conclusion:** Package is the source of truth and is already a superset. No porting from API to package was needed.

## File List

- **CREATED:** `apps/api/src/lib/sync/push/posting-executor.ts` — Executor implementation for `SyncPushPostingExecutor` interface
- **MODIFIED:** `apps/api/src/lib/sync/push/transactions.ts` — Updated import and call site
- **DELETED:** `apps/api/src/lib/sync-push-posting.ts` — Removed duplicate

## Status

- [x] All acceptance criteria met
- [x] All validations passed
- Status: **review**
