# Story 3.5: Fixed Assets Domain Extraction

Status: done

## Story

As a **Jurnapod developer**,
I want **fixed-asset logic extracted into `lib/fixed-assets/`**,
So that **asset and category operations can be changed without reopening the master-data monolith**.

## Acceptance Criteria

1. Fixed-asset and fixed-asset-category CRUD/read functions live in `apps/api/src/lib/fixed-assets/index.ts`.
2. `routes/accounts.ts` no longer imports those functions from `lib/master-data.ts`.
3. Existing behavior remains unchanged, including company/outlet scoping and reference validation.
4. Targeted validation passes for accounts/fixed-assets callers.

## Tasks / Subtasks

- [x] Create `apps/api/src/lib/fixed-assets/index.ts`
- [x] Move fixed-asset functions and required shared errors/types
- [x] Update callers
- [x] Run targeted validation

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/lib/fixed-assets/index.ts` | Fixed-asset domain functions |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/accounts.ts` | Modify | Repoint fixed-asset imports |
| `apps/api/src/lib/master-data.ts` | Modify | Remove fixed-asset exports after migration |

## Estimated Effort

0.5-1 day

## Risk Level

Medium

## Dev Notes

- Extracted fixed-asset and fixed-asset-category CRUD/read logic into `apps/api/src/lib/fixed-assets/index.ts`.
- Repointed `routes/accounts.ts` to the new fixed-assets domain module.
- Removed fixed-asset exports from the monolith; remaining dead code was fully eliminated during Story 3.6 when `lib/master-data.ts` was deleted.
- AI review: no P0/P1 blockers; lack of dedicated fixed-asset route tests noted as follow-up coverage work.

## File List

- `apps/api/src/lib/fixed-assets/index.ts` (new)
- `apps/api/src/routes/accounts.ts`
- `apps/api/src/lib/master-data.ts` (deleted in Story 3.6)

## Validation Evidence

- `timeout 180s npm run typecheck -w @jurnapod/api` ✅
- `timeout 180s npm run lint -w @jurnapod/api` ✅
- `timeout 180s npm run test:single apps/api/src/routes/accounts.test.ts` ✅
