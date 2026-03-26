# Story 3.6: Sync Master Data Finalization

Status: done

## Story

As a **Jurnapod developer**,
I want **sync master-data assembly finalized against extracted domain modules**,
So that **`lib/master-data.ts` can be deleted safely after all callers move**.

## Acceptance Criteria

1. `lib/sync/master-data.ts` imports domain reads from extracted modules instead of `lib/master-data.ts`.
2. No remaining imports of `apps/api/src/lib/master-data.ts` exist in the API workspace.
3. `apps/api/src/lib/master-data.ts` is deleted.
4. `npm run typecheck -w @jurnapod/api`, `npm run lint -w @jurnapod/api`, and `npm run test:unit -w @jurnapod/api` pass.

## Tasks / Subtasks

- [x] Update sync assembly imports
- [x] Verify no remaining callers of `lib/master-data.ts`
- [x] Delete `apps/api/src/lib/master-data.ts`
- [x] Run full API validation

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/lib/sync/master-data.ts` | Modify | Repoint sync reads to domain modules |
| `apps/api/src/lib/master-data.ts` | Delete | Remove monolith after migration |

## Estimated Effort

0.5-1 day

## Risk Level

Medium

## Dev Notes

- Repointed sync and test callers away from `lib/master-data.ts`.
- Introduced `apps/api/src/lib/master-data-errors.ts` so shared error classes continue to exist after monolith deletion.
- Deleted `apps/api/src/lib/master-data.ts` after verifying no remaining API workspace imports.
- AI review: no P0/P1/P2 findings after finalization.

## File List

- `apps/api/src/lib/master-data-errors.ts` (new)
- `apps/api/src/lib/sync/master-data.ts`
- `apps/api/src/lib/item-groups/index.ts`
- `apps/api/src/lib/items/index.ts`
- `apps/api/src/lib/item-prices/index.ts`
- `apps/api/src/lib/supplies/index.ts`
- `apps/api/src/lib/fixed-assets/index.ts`
- `apps/api/src/routes/inventory.ts`
- `apps/api/src/routes/supplies.ts`
- `apps/api/src/routes/accounts.ts`
- `apps/api/src/lib/master-data.thumbnail-sync.test.ts`
- `apps/api/src/lib/master-data.supplies.test.ts`
- `apps/api/src/lib/master-data.ts` (deleted)

## Validation Evidence

- `timeout 180s npm run typecheck -w @jurnapod/api` ✅
- `timeout 180s npm run lint -w @jurnapod/api` ✅
- `timeout 180s npm run test:unit -w @jurnapod/api` ✅ (714/714 passing)
