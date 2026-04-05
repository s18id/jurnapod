# Story 35.2: Migrate modules-reservations to Shared Actor

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-35.2 |
| Title | Migrate modules-reservations to Shared Actor |
| Status | pending |
| Type | Refactor |
| Sprint | TBD |
| Priority | P1 |
| Estimate | 4-6h |

## Story

As a platform engineer, I want to replace `ReservationGroupActor` and `OutletTableActor` in `modules-reservations` with the shared `Actor` type, so that the module uses a single unified actor definition.

## Background

This story migrates the `modules-reservations` package to use the canonical `Actor` interface from `@jurnapod/shared`. After this story, the local actor types `ReservationGroupActor` and `OutletTableActor` should be removed and replaced with imports from shared.

Affected files in `modules-reservations`:
- `src/reservation-groups/types.ts` — defines `ReservationGroupActor`
- `src/outlet-tables/types.ts` — defines `OutletTableActor`

## Acceptance Criteria

1. `packages/modules/reservations/src/reservation-groups/types.ts` imports `Actor` from `@jurnapod/shared`
2. `packages/modules/reservations/src/outlet-tables/types.ts` imports `Actor` from `@jurnapod/shared`
3. All references to `ReservationGroupActor` and `OutletTableActor` are updated to use `Actor`
4. Local `ReservationGroupActor` and `OutletTableActor` type definitions are removed
5. Service signatures are updated to use shared `Actor`
6. `npm run typecheck -w @jurnapod/modules-reservations` passes

## Technical Notes

- `ReservationGroupActor` had fields: `userId: number`, `ipAddress?: string | null`
- `OutletTableActor` had fields: `userId: number`, `outletId?: number | null`, `ipAddress?: string | null`
- The shared `Actor` has all required fields: `userId`, `outletId?`, `ipAddress?`
- Ensure all API wrappers that construct actors are updated to match

## Tasks

- [ ] Update `packages/modules/reservations/src/reservation-groups/types.ts` to import `Actor` from shared
- [ ] Replace `ReservationGroupActor` with `Actor` in all type definitions and function signatures
- [ ] Update `packages/modules/reservations/src/outlet-tables/types.ts` to import `Actor` from shared
- [ ] Replace `OutletTableActor` with `Actor` in all type definitions and function signatures
- [ ] Remove local actor type definitions from both files
- [ ] Update service files that use these actor types
- [ ] Run typecheck and fix any issues
- [ ] Verify tests pass

## Validation

```bash
npm run typecheck -w @jurnapod/modules-reservations
```
