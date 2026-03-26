# Story 3.1: Item Groups Domain Extraction

Status: done

## Story

As a **Jurnapod developer**,
I want **item-group master-data logic extracted into `lib/item-groups/`**,
So that **inventory caller updates stay small and low-risk**.

## Acceptance Criteria

1. `listItemGroups`, `findItemGroupById`, `createItemGroup`, `createItemGroupsBulk`, `updateItemGroup`, and `deleteItemGroup` live in `apps/api/src/lib/item-groups/index.ts`.
2. `routes/inventory.ts` no longer imports item-group functions from `lib/master-data.ts`.
3. Behavior and exported errors remain unchanged for item-group callers.
4. Targeted validation passes for inventory-related typecheck/tests impacted by the move.

## Tasks / Subtasks

- [x] Create `apps/api/src/lib/item-groups/index.ts`
- [x] Move item-group functions and required shared errors/types
- [x] Update static and dynamic imports in `routes/inventory.ts`
- [x] Run targeted validation

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/lib/item-groups/index.ts` | Item-group domain functions |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/inventory.ts` | Modify | Repoint item-group imports |
| `apps/api/src/lib/master-data.ts` | Modify | Remove item-group exports after migration |

## Estimated Effort

0.5-1 day

## Risk Level

Low

## Dev Notes

- Extracted item-group CRUD/read logic into `apps/api/src/lib/item-groups/index.ts`.
- Repointed `routes/inventory.ts` item-group imports and dynamic imports to the new domain module.
- Removed item-group exports from `apps/api/src/lib/master-data.ts` while preserving its remaining internal behavior.
- AI review: no P0/P1 findings; one non-blocking P2 on helper duplication accepted for now.

## File List

- `apps/api/src/lib/item-groups/index.ts` (new)
- `apps/api/src/routes/inventory.ts`
- `apps/api/src/lib/master-data.ts`

## Validation Evidence

- `timeout 180s npm run typecheck -w @jurnapod/api` ✅
- `timeout 180s npm run lint -w @jurnapod/api` ✅
- `timeout 180s npm run test:single apps/api/src/routes/inventory.test.ts` ✅
