# Story 3.2: Items Domain Extraction

Status: done

## Story

As a **Jurnapod developer**,
I want **item master-data logic extracted into `lib/items/`**,
So that **item CRUD changes can be reviewed independently from other domains**.

## Acceptance Criteria

1. `listItems`, `findItemById`, `createItem`, `updateItem`, `deleteItem`, and `getItemVariantStats` live in `apps/api/src/lib/items/index.ts`.
2. `routes/inventory.ts` and any other callers no longer import those functions from `lib/master-data.ts`.
3. Exported behavior remains unchanged, including tenant scoping and validation semantics.
4. Targeted validation passes for item-related callers.

## Tasks / Subtasks

- [x] Create `apps/api/src/lib/items/index.ts`
- [x] Move item functions and required shared errors/types
- [x] Update callers
- [x] Run targeted validation

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/lib/items/index.ts` | Item domain functions |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/inventory.ts` | Modify | Repoint item imports |
| `apps/api/src/lib/master-data.ts` | Modify | Remove item exports after migration |

## Estimated Effort

0.5-1 day

## Risk Level

Low

## Dev Notes

- Extracted item CRUD/read logic plus `getItemVariantStats` into `apps/api/src/lib/items/index.ts`.
- Repointed `routes/inventory.ts` item imports to the new domain module.
- Removed item exports from `apps/api/src/lib/master-data.ts` while preserving remaining internal usage.
- AI review: no P0/P1 findings; non-blocking duplication risk deferred to later refactor.

## File List

- `apps/api/src/lib/items/index.ts` (new)
- `apps/api/src/routes/inventory.ts`
- `apps/api/src/lib/master-data.ts`

## Validation Evidence

- `timeout 180s npm run typecheck -w @jurnapod/api` ✅
- `timeout 180s npm run lint -w @jurnapod/api` ✅
- `timeout 180s npm run test:single apps/api/src/routes/inventory.test.ts` ✅
