# Story 35.6: Update API Wrappers and Cleanup

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-35.6 |
| Title | Update API Wrappers and Cleanup |
| Status | pending |
| Type | Refactor |
| Sprint | TBD |
| Priority | P2 |
| Estimate | 2-4h |

## Story

As a platform engineer, I want to ensure API wrappers correctly construct `Actor` objects and cleanup any remaining deprecated local actor type definitions, so that the migration is complete and consistent across the codebase.

## Background

This story is the final cleanup step for Epic 35. After all modules have been migrated to use the shared `Actor` type, this story ensures that:
1. All API wrappers correctly construct `Actor` from auth context
2. No deprecated actor type definitions remain in the codebase
3. Full integration tests pass

## Acceptance Criteria

1. All API wrappers that pass actor to services correctly construct `Actor` from auth context
2. No deprecated local actor type definitions remain (search for `ReservationGroupActor`, `OutletTableActor`, `CompanyActor`, `MutationActor` in type files, `MutationAuditActor` in local types)
3. All packages typecheck successfully
4. Full integration tests pass

## Technical Notes

- API wrappers typically construct actor from auth context which includes `userId`, `outletId`, and `ipAddress`
- Search for any remaining deprecated types in:
  - `packages/modules/*/src/**/*.ts`
  - `apps/api/src/**/*.ts`
- Ensure backward compatibility - services that previously accepted `MutationActor` (with just `userId`) should still work

## Tasks

- [ ] Audit all API wrappers that construct and pass actor to services
- [ ] Ensure they correctly populate all `Actor` fields from auth context
- [ ] Search for and delete any remaining deprecated actor type definitions
- [ ] Run `npm run typecheck` across all packages
- [ ] Run full integration tests
- [ ] Fix any issues found

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run typecheck -w @jurnapod/modules-accounting
npm run typecheck -w @jurnapod/modules-inventory
npm run typecheck -w @jurnapod/modules-platform
npm run typecheck -w @jurnapod/modules-reservations
npm run typecheck -w @jurnapod/modules-sales
npm run typecheck -w @jurnapod/modules-treasury
```
