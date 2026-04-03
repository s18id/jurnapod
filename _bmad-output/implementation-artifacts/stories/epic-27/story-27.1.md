# story-27.1: Contract alignment & type source-of-truth

## Description

Establish package-level type ownership for the sync push domain. Move domain types/constants from `apps/api/src/lib/sync/push/types.ts` to package ownership, and remove stale `mysql2` pool types.

## Context

`apps/api/src/lib/sync/push/types.ts` (378 LOC) currently contains:
- Domain result payloads (`PostPushResult`, `SyncPushVariantSaleResult`, `StockDeductResult`)
- Domain constants (`TRANSACTION_TYPE_MAP`, `ADJUSTMENT_TYPE_MAP`)
- Domain errors (`SyncStockConflictError`, `SyncStockOverflowError`, etc.)
- Stale `mysql2` pool types that should not exist here

This story establishes the correct package ownership before stories 27.2–27.5 do the actual extraction.

## Package ownership decisions

| Type category | Owner package |
|---|---|
| Push domain result payloads | `@jurnapod/pos-sync` |
| Idempotency constants | `@jurnapod/sync-core` |
| API request/response Zod schemas | `@jurnapod/shared` |
| Error classes | `@jurnapod/pos-sync` |

## Acceptance Criteria

- [ ] Push domain result types (`PostPushResult`, `SyncPushVariantSaleResult`, `SyncVariantStockAdjustResult`, `StockDeductResult`) exported from `@jurnapod/pos-sync`
- [ ] Idempotency constants (`TRANSACTION_TYPE_MAP`, `ADJUSTMENT_TYPE_MAP`) moved to `@jurnapod/sync-core`
- [ ] Domain errors (`SyncStockConflictError`, `SyncStockOverflowError`, `SyncStockNotFoundError`, `SyncValidationError`) exported from `@jurnapod/pos-sync`
- [ ] Stale `mysql2` pool types removed from `apps/api/src/lib/sync/push/types.ts`
- [ ] `apps/api/src/lib/sync/push/types.ts` becomes thin re-export facade
- [ ] All existing consumers (routes, sync push lib files) continue to compile
- [ ] `npm run typecheck -w @jurnapod/api`
- [ ] `npm run typecheck -w @jurnapod/pos-sync`

## Files to Modify

```
packages/pos-sync/src/push/types.ts          (add domain result types + errors)
packages/sync-core/src/                      (add idempotency constants)
apps/api/src/lib/sync/push/types.ts          (become thin re-export facade)
apps/api/src/routes/sync/push.ts             (update imports if needed)
apps/api/src/lib/sync/push/transactions.ts   (update imports if needed)
apps/api/src/lib/sync/push/stock.ts          (update imports if needed)
```

## Dependency

- None — this is the foundation for all other Epic 27 stories

## Implementation Notes

### Add to `packages/pos-sync/src/push/types.ts`:
```typescript
// Domain result types
export interface StockDeductResult {
  variantId: number;
  quantity: number;
  transactionId: number;
  unitCost: number;
  totalCost: number;
  costResult: ItemCostResult;
}

export interface SyncPushVariantSaleResult {
  txId: string;
  status: "accepted" | "conflict" | "error";
  conflicts?: StockConflict[];
  cogsPosted?: boolean;
  postingJournalBatchId?: number;
}

export interface SyncVariantStockAdjustResult {
  txId: string;
  adjustmentType: string;
  status: "accepted" | "error";
  postingJournalBatchId?: number;
}

// Domain errors
export class SyncStockConflictError extends Error { ... }
export class SyncStockOverflowError extends Error { ... }
export class SyncStockNotFoundError extends Error { ... }
export class SyncValidationError extends Error { ... }
```

### Add to `packages/sync-core/src/constants.ts`:
```typescript
export const TRANSACTION_TYPE_MAP = { ... } as const;
export const ADJUSTMENT_TYPE_MAP = { ... } as const;
```

### Thin `apps/api/src/lib/sync/push/types.ts` facade:
```typescript
// Re-export everything from packages
export { PostPushResult, SyncPushVariantSaleResult, SyncVariantStockAdjustResult, StockDeductResult } from "@jurnapod/pos-sync";
export { SyncStockConflictError, SyncStockOverflowError, SyncStockNotFoundError, SyncValidationError } from "@jurnapod/pos-sync";
export { TRANSACTION_TYPE_MAP, ADJUSTMENT_TYPE_MAP } from "@jurnapod/sync-core";
```

## Validation Commands

```bash
npm run typecheck -w @jurnapod/pos-sync
npm run typecheck -w @jurnapod/sync-core
npm run typecheck -w @jurnapod/api
```
