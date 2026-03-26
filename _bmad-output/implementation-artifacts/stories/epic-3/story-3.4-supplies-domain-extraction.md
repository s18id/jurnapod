# Story 3.4: Supplies Domain Extraction

Status: done

## Story

As a **Jurnapod developer**,
I want **supplies logic extracted into `lib/supplies/`**,
So that **supply CRUD can evolve without touching unrelated master-data code**.

## Acceptance Criteria

1. `listSupplies`, `findSupplyById`, `createSupply`, `updateSupply`, and `deleteSupply` live in `apps/api/src/lib/supplies/index.ts`.
2. `routes/supplies.ts` no longer imports supply functions from `lib/master-data.ts`.
3. Conflict/reference error behavior remains unchanged.
4. Targeted validation passes for supplies callers.

## Tasks / Subtasks

- [x] Create `apps/api/src/lib/supplies/index.ts`
- [x] Move supply functions and required shared errors/types
- [x] Update callers
- [x] Run targeted validation

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/lib/supplies/index.ts` | Supply domain functions |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/supplies.ts` | Modify | Repoint supply imports |
| `apps/api/src/lib/master-data.ts` | Modify | Remove supply exports after migration |

## Estimated Effort

0.5 day

## Risk Level

Low

## Dev Notes

- Extracted supply CRUD/read logic into `apps/api/src/lib/supplies/index.ts`.
- Repointed `routes/supplies.ts` and supply regression tests to the new domain module.
- Removed the dead supply implementation from `apps/api/src/lib/master-data.ts` after extraction.
- AI review: no P0/P1 findings; remaining helper duplication is deferred for later shared-helper cleanup.

## File List

- `apps/api/src/lib/supplies/index.ts` (new)
- `apps/api/src/routes/supplies.ts`
- `apps/api/src/lib/master-data.supplies.test.ts`
- `apps/api/src/lib/master-data.ts`

## Validation Evidence

- `timeout 180s npm run typecheck -w @jurnapod/api` ✅
- `timeout 180s npm run lint -w @jurnapod/api` ✅
- `timeout 180s npm run test:single apps/api/src/lib/master-data.supplies.test.ts` ✅
