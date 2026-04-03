# story-27.5: Implement phase2 in pos-sync (replace stubs)

## Description

Replace the stub implementations in `packages/pos-sync/src/push/index.ts` with concrete phase2 orchestration. The stubs are at approximately lines 362, 367, 744, 759, 1068.

## Context

`packages/pos-sync/src/push/index.ts` (1238 LOC) contains stubs for phase2 operations:
- `deductStockForTransaction(...)` — stub
- `postCogsForDeduction(...)` — stub
- `runPosSalePostingHook(...)` — stub
- `releaseTableIfNeeded(...)` — stub
- `completeReservationIfNeeded(...)` — stub
- `recordAcceptedAudit(...)` — stub
- `recordPostingFailureAudit(...)` — stub

This story wires these stubs to the actual package implementations from stories 27.2, 27.3, and 27.4.

## Acceptance Criteria

- [x] Phase2 `deductStockForTransaction` calls `modules-inventory.resolveAndDeductForPosTransaction`
- [x] Phase2 `postCogsForDeduction` calls `modules-accounting.postCogsForSale`
- [x] Idempotency guard behavior preserved (checks inventory_transactions before deducting)
- [ ] Phase2 `runPosSalePostingHook` calls `modules-accounting.runSyncPushPostingHook` (stubbed - requires API executor, story 27.6)
- [ ] Phase2 `releaseTableIfNeeded` calls table management in `modules-reservations` (stubbed - story 27.6)
- [ ] Phase2 `completeReservationIfNeeded` updates reservation state via `modules-reservations` (stubbed - story 27.6)
- [ ] Audit records written via `modules-telemetry` (stubbed - story 27.6)
- [ ] All stubs replaced with concrete package calls (PARTIAL - stock+COGS done, rest stubbed)
- [ ] `npm run typecheck -w @jurnapod/pos-sync` (FAILS - missing tsconfig project references to modules-inventory/modules-accounting)
- [ ] `npm run build -w @jurnapod/pos-sync` (FAILS - missing tsconfig project references)

## Files to Modify

```
packages/pos-sync/src/push/index.ts    (IMPLEMENTED: stock deduction + COGS posting, stubbed posting hook)
packages/modules-inventory/src/        (already implemented in 27.4)
packages/modules-accounting/src/        (already wired in 27.2/27.3)
packages/modules-reservations/src/      (table/reservation calls) - NOT IMPLEMENTED (story 27.6)
packages/telemetry/                     (audit calls) - NOT IMPLEMENTED (story 27.6)
```

## Additional Infrastructure Required

The following files need project references added to enable pos-sync to import modules-inventory and modules-accounting:

**packages/pos-sync/tsconfig.json** - add references:
```json
"references": [
  {"path": "../shared"},
  {"path": "../sync-core"},
  {"path": "../modules/inventory-costing"},
  {"path": "../modules/inventory"},   <!-- ADD THIS -->
  {"path": "../modules/accounting"}    <!-- ADD THIS -->
]
```

**packages/pos-sync/package.json** - add dependencies:
```json
"dependencies": {
  "@jurnapod/modules-inventory": "0.1.0",  <!-- ADD THIS -->
  "@jurnapod/modules-accounting": "0.1.0"  <!-- ADD THIS -->
}
```

These changes are outside the scope of this story (constraint: only modify push/index.ts) but are required for validation to pass.

## Dependency

- `story-27.5` → `story-27.2`, `story-27.3`, `story-27.4` (all package implementations must exist)

## Implementation Notes

### Stub locations (approximate — verify by reading file)
```
line ~362:  deductStockForTransaction stub
line ~367:  postCogsForDeduction stub
line ~744:  runPosSalePostingHook stub
line ~759:  releaseTableIfNeeded stub
line ~1068: completeReservationIfNeeded stub
```

### Replacement pattern
```typescript
// deductStockForTransaction — replace stub with:
import { getStockService } from "@jurnapod/modules-inventory";

async deductStockForTransaction(tx: PosTransaction, db: KyselySchema): Promise<StockDeductResult[]> {
  const service = getStockService(db);
  return service.resolveAndDeductForPosTransaction({
    companyId: tx.companyId,
    outletId: tx.outletId,
    posTransactionId: tx.id,
    items: tx.items.map(i => ({
      variantId: i.variantId,
      itemId: i.itemId,
      quantity: i.quantity,
      trackStock: i.trackStock
    })),
    referenceId: tx.id,
    userId: tx.userId
  }, db);
}

// postCogsForDeduction — replace stub with:
import { postCogsForSale } from "@jurnapod/modules-accounting/posting/cogs";

async postCogsForDeduction(deductResults: StockDeductResult[], db: KyselySchema): Promise<void> {
  await postCogsForSale({
    companyId: deductResults[0].companyId,
    items: deductResults.map(r => ({ itemId: r.itemId, qty: r.quantity, unitCost: r.unitCost })),
    db
  });
}

// runPosSalePostingHook — replace stub with:
import { runSyncPushPostingHook } from "@jurnapod/modules-accounting/posting/sync-push";

async runPosSalePostingHook(tx: PosTransaction, db: KyselySchema): Promise<number> {
  return runSyncPushPostingHook({ transactionId: tx.id, companyId: tx.companyId, db });
}
```

### Preserve idempotency guard
The existing guard that checks `accepted_txs` before running phase2 must remain. Do not remove it.

## Validation Commands

```bash
npm run typecheck -w @jurnapod/pos-sync
npm run build -w @jurnapod/pos-sync
npm run typecheck -w @jurnapod/modules-inventory
npm run typecheck -w @jurnapod/modules-accounting
```

## Status

**Status:** `in-progress` (blocked by missing tsconfig project references)

## Dev Agent Record

### Implementation Summary

**What was implemented:**
1. Stock deduction via `getStockService(db).resolveAndDeductForPosTransaction()` - called for COMPLETED transactions only
2. COGS posting via `postCogsForSale()` - called when stock deduction returns results
3. Idempotency check - queries `inventory_transactions` before deducting to skip already-deducted transactions on retry
4. Added required imports: `sql` from kysely, `getStockService` from modules-inventory, `postCogsForSale` and `StockCostEntry` from modules-accounting

**What was stubbed (deferred to story 27.6):**
1. Posting hook (`runSyncPushPostingHook`) - requires `KyselyPosSyncPushPostingExecutor` from API layer which cannot be imported in pos-sync
2. Table release (`releaseTableIfNeeded`) - needs modules-reservations
3. Reservation completion (`completeReservationIfNeeded`) - needs modules-reservations
4. Audit records - needs modules-telemetry

### Why Posting Hook is Stubbed

The `runSyncPushPostingHook` function requires a `SyncPushPostingExecutor` interface implementation (`KyselyPosSyncPushPostingExecutor`) which lives in `apps/api/src/lib/sync/push/posting-executor.ts`. Since pos-sync cannot import from apps/api (would create circular dependency), the posting hook is stubbed with a comment indicating it will be implemented in story 27.6 using an inline executor approach.

### Files Changed

- `packages/pos-sync/src/push/index.ts` (+74 lines, -7 lines)

### Blockers

1. **Missing tsconfig project references**: pos-sync tsconfig.json does not reference `@jurnapod/modules-inventory` or `@jurnapod/modules-accounting`. TypeScript build fails with "File is not listed within the file list of project" errors.
2. **Missing package dependencies**: pos-sync package.json does not list `@jurnapod/modules-inventory` or `@jurnapod/modules-accounting` as dependencies.

These infrastructure issues are outside the constraint scope ("only modify push/index.ts") but must be resolved for validation to pass.
