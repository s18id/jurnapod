# Story 3.3: Item Prices Domain Extraction

Status: done

## Story

As a **Jurnapod developer**,
I want **item-price logic extracted into `lib/item-prices/`**,
So that **shared outlet pricing reads used by sync and backoffice live in one focused module**.

## Acceptance Criteria

1. `listItemPrices`, `listEffectiveItemPricesForOutlet`, `findItemPriceById`, `createItemPrice`, `updateItemPrice`, and `deleteItemPrice` live in `apps/api/src/lib/item-prices/index.ts`.
2. `routes/inventory.ts` and `lib/sync/master-data.ts` import shared pricing reads from `lib/item-prices/`.
3. Shared pricing behavior for outlet overrides remains unchanged.
4. Targeted validation passes for inventory and sync-pull callers.

## Tasks / Subtasks

- [x] Create `apps/api/src/lib/item-prices/index.ts`
- [x] Move item-price functions and required shared errors/types
- [x] Update inventory and sync imports
- [x] Run targeted validation

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/lib/item-prices/index.ts` | Item-price domain functions |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/inventory.ts` | Modify | Repoint item-price imports |
| `apps/api/src/lib/sync/master-data.ts` | Modify | Import shared pricing reads from domain module |
| `apps/api/src/lib/master-data.ts` | Modify | Remove item-price exports after migration |

## Estimated Effort

0.5-1 day

## Risk Level

Medium

## Dev Notes

- Extracted item-price CRUD/read logic into `apps/api/src/lib/item-prices/index.ts`.
- Repointed `routes/inventory.ts`, `lib/sync/master-data.ts`, and item-price regression tests to the new module.
- Removed item-price exports from `apps/api/src/lib/master-data.ts` while preserving remaining internal behavior.
- AI review: no P0/P1 findings. One review concern about `sync/pull/index.ts` was a false alarm because `../master-data.js` there already resolves to `lib/sync/master-data.ts`.
- Remaining duplication risk is accepted temporarily and will be addressed during later master-data finalization.

## File List

- `apps/api/src/lib/item-prices/index.ts` (new)
- `apps/api/src/routes/inventory.ts`
- `apps/api/src/lib/sync/master-data.ts`
- `apps/api/src/lib/master-data.ts`
- `apps/api/src/lib/master-data.item-prices.test.ts`

## Validation Evidence

- `timeout 180s npm run typecheck -w @jurnapod/api` ✅
- `timeout 180s npm run lint -w @jurnapod/api` ✅
- `timeout 180s npm run test:single apps/api/src/routes/inventory.test.ts` ✅
- `timeout 180s npm run test:single apps/api/src/lib/master-data.item-prices.test.ts` ✅
- `timeout 180s npm run test:single apps/api/src/routes/sync/pull.test.ts` ✅
