# Story 17-6: Refactor API Routes as Thin Adapters

Status: ready-for-dev
Priority: P0
Epic: Resurrect Sync-Core (Sync Module Architecture)

---

## Story

As a developer maintaining the sync architecture,
I want the API routes to become thin HTTP adapters that delegate to pos-sync,
so that business logic is centralized in the sync module and the API layer focuses on HTTP concerns only.

## Context

Based on party-mode consensus from prior session:
- Pattern: API iterates Phase 1 results (NOT callback pattern)
- Feature flag: `PUSH_SYNC_MODE` for gradual rollout
- Tax context stays in API, pass as parameter
- Migration: shadow mode → 10% → 50% → 100%
- Phase 1 (pos-sync): persistence, order creation, payment linking
- Phase 2 (API): COGS posting, stock deduction, table release, reservation update, posting hook
- Two-phase push sync already implemented in pos-sync and API

The current API routes (`apps/api/src/routes/sync/push.ts`) still contain significant business logic including:
- Tax rate loading and context building
- Orchestration of sync push operations via `orchestrateSyncPush()` from `lib/sync/push/`
- Result aggregation and response formatting

The goal is to refactor these routes to be thin adapters that:
1. Parse and validate HTTP requests
2. Delegate all business logic to `pos-sync` package
3. Handle HTTP-specific concerns (auth, headers, response formatting)

## Acceptance Criteria

1. **Feature Flag Implementation** (AC-1)
   - Implement `PUSH_SYNC_MODE` environment variable for gradual rollout
   - Support values: `shadow`, `10`, `50`, `100` (percentage rollout)
   - Default to `shadow` mode (log but don't use new path)

2. **Route Refactoring - Push** (AC-2)
   - Refactor `apps/api/src/routes/sync/push.ts` to use `PosSyncModule` directly
   - Remove dependency on `lib/sync/push/index.js` (orchestrateSyncPush)
   - Tax context is fetched in route and passed as parameter to pos-sync
   - Route handles: auth, validation, tax context loading, delegation to pos-sync, response formatting

3. **Route Refactoring - Pull** (AC-3)
   - Refactor `apps/api/src/routes/sync/pull.ts` to use `PosSyncModule` directly
   - Remove dependency on `lib/sync/pull/` modules
   - Route handles: auth, validation, delegation to pos-sync, response formatting

4. **Orchestration Pattern** (AC-4)
   - API iterates Phase 1 results (NOT callback pattern)
   - Phase 1: pos-sync handles persistence (transactions, orders, items, payments, taxes)
   - Phase 2: API handles COGS posting, stock deduction, table release, reservation update, posting hook
   - Clear separation between Phase 1 (data) and Phase 2 (business logic)

5. **Rollback Safety** (AC-5)
   - Feature flag allows instant rollback to old implementation
   - Shadow mode logs metrics for comparison without affecting production
   - No data migration required (both paths use same database schema)

6. **Test Coverage** (AC-6)
   - Update existing route tests to work with refactored structure
   - Add tests for feature flag behavior
   - Verify both old and new paths pass same test assertions (in shadow mode)

## Tasks / Subtasks

- [ ] Task 1: Implement PUSH_SYNC_MODE feature flag (AC-1)
  - [ ] Add feature flag configuration utility
  - [ ] Implement rollout percentage logic
  - [ ] Add shadow mode logging
- [ ] Task 2: Refactor push route to thin adapter (AC-2, AC-4)
  - [ ] Update imports to use PosSyncModule
  - [ ] Extract tax context loading to route level
  - [ ] Implement two-phase iteration pattern
  - [ ] Remove lib/sync/push dependency
- [ ] Task 3: Refactor pull route to thin adapter (AC-3)
  - [ ] Update imports to use PosSyncModule
  - [ ] Remove lib/sync/pull dependency
- [ ] Task 4: Implement rollback safety (AC-5)
  - [ ] Add feature flag checks at route entry points
  - [ ] Ensure old implementation remains callable
- [ ] Task 5: Update tests (AC-6)
  - [ ] Update route tests for new structure
  - [ ] Add feature flag test cases

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `apps/api/src/routes/sync/push.ts` | 1-225 | Refactor to thin adapter |
| `apps/api/src/routes/sync/pull.ts` | 1-150 | Refactor to thin adapter |
| `apps/api/src/lib/feature-flags.ts` | New | Add PUSH_SYNC_MODE feature flag |
| `apps/api/src/routes/sync/push.test.ts` | All | Update for refactored structure |
| `apps/api/src/routes/sync/pull.test.ts` | All | Update for refactored structure |

## Files to Delete (after 17-6 completes)

| File | Reason |
|------|--------|
| `apps/api/src/lib/sync/push/index.ts` | Logic moved to pos-sync |
| `apps/api/src/lib/sync/push/types.ts` | Types moved to pos-sync |
| `apps/api/src/lib/sync/push/transactions.ts` | Logic moved to pos-sync |
| `apps/api/src/lib/sync/push/orders.ts` | Logic moved to pos-sync |
| `apps/api/src/lib/sync/push/stock.ts` | Logic moved to pos-sync |
| `apps/api/src/lib/sync/push/idempotency.ts` | Logic moved to pos-sync |
| `apps/api/src/lib/sync/push/variant-sales.ts` | Logic moved to pos-sync |
| `apps/api/src/lib/sync/push/variant-stock-adjustments.ts` | Logic moved to pos-sync |
| `apps/api/src/lib/sync/pull/index.ts` | Logic moved to pos-sync |
| `apps/api/src/lib/sync/pull/types.ts` | Types moved to pos-sync |

## Dev Notes

### Two-Phase Push Pattern

```typescript
// Phase 1: pos-sync handles persistence
const phase1Results = await posSyncModule.handlePushSync({
  db,
  companyId,
  outletId,
  transactions,
  activeOrders,
  orderUpdates,
  itemCancellations,
  variantSales,
  variantStockAdjustments,
  taxContext,  // Passed from API layer
  correlationId,
});

// Phase 2: API iterates Phase 1 results
for (const result of phase1Results) {
  if (result.status === 'success') {
    // COGS posting
    await postCOGS(db, result.transaction);
    
    // Stock deduction
    await deductStock(db, result.items);
    
    // Table release (if applicable)
    if (result.tableId) {
      await releaseTable(db, result.tableId);
    }
    
    // Reservation update (if applicable)
    if (result.reservationId) {
      await updateReservation(db, result.reservationId);
    }
    
    // Posting hook
    await invokePostingHook(result);
  }
}
```

### Feature Flag Implementation

```typescript
// apps/api/src/lib/feature-flags.ts
export function getPushSyncMode(): 'shadow' | number {
  const mode = process.env.PUSH_SYNC_MODE || 'shadow';
  if (mode === 'shadow') return 'shadow';
  const pct = parseInt(mode, 10);
  if (isNaN(pct) || pct < 0 || pct > 100) return 'shadow';
  return pct;
}

export function shouldUseNewPushSync(companyId: number): boolean {
  const mode = getPushSyncMode();
  if (mode === 'shadow') return false;
  // Deterministic rollout based on companyId
  return (companyId % 100) < mode;
}
```

### Tax Context Flow

Tax context stays in API layer because:
1. Tax rates are company-level configuration
2. API already has tax service functions (`lib/taxes.ts`)
3. Avoids pos-sync needing to query tax configuration
4. Keeps pos-sync focused on sync operations only

```typescript
// In route
const taxContext = await buildTaxContext(db, auth.companyId);

// Pass to pos-sync
const results = await posSyncModule.handlePushSync({
  ...params,
  taxContext,
});
```

### Rollout Strategy

1. **Shadow mode** (week 1): Log metrics, compare outputs, no user impact
2. **10% rollout** (week 2): Canary companies, monitor error rates
3. **50% rollout** (week 3): Half of companies, monitor closely
4. **100% rollout** (week 4): All companies, deprecate old path
5. **Cleanup** (after 17-7): Remove feature flag, delete lib/sync

### Testing Strategy

- Unit tests for feature flag logic
- Integration tests for both old and new paths (shadow mode)
- Performance comparison tests
- Error handling verification

## Definition of Done

- [ ] Feature flag `PUSH_SYNC_MODE` implemented and configurable
- [ ] Push route refactored to thin adapter using PosSyncModule
- [ ] Pull route refactored to thin adapter using PosSyncModule
- [ ] Tax context passed from API to pos-sync as parameter
- [ ] Two-phase pattern implemented (API iterates Phase 1 results)
- [ ] Old implementation remains callable (rollback safety)
- [ ] All existing tests pass
- [ ] New tests for feature flag behavior
- [ ] Documentation updated (migration guide, feature flag usage)

## Dependencies

- Story 17-5: Move push logic to pos-sync (COMPLETED)
- Story 17-4: Move pull logic to pos-sync (COMPLETED)
- pos-sync package with `handlePushSync` and `handlePullSync` methods

## References

- [Source: `apps/api/src/routes/sync/push.ts`]
- [Source: `apps/api/src/routes/sync/pull.ts`]
- [Source: `packages/pos-sync/src/push/index.ts`]
- [Source: `packages/pos-sync/src/pull/index.ts`]
- [Source: `packages/pos-sync/src/pos-sync-module.ts`]

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
