# Story 35.4: Migrate modules-sales to Shared Actor

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-35.4 |
| Title | Migrate modules-sales to Shared Actor |
| Status | pending |
| Type | Refactor |
| Sprint | TBD |
| Priority | P1 |
| Estimate | 2-4h |

## Story

As a platform engineer, I want to replace `MutationActor` in `modules-sales` with the shared `Actor` type, so that the sales module uses a single unified actor definition.

## Background

This story migrates the `modules-sales` package to use the canonical `Actor` interface from `@jurnapod/shared`. After this story, the local actor type `MutationActor` should be removed and replaced with imports from shared.

Affected files in `modules-sales`:
- `src/types/payments.ts` — defines `MutationActor`
- `src/types/invoices.ts` — defines `MutationActor`
- `src/types/credit-notes.ts` — defines `MutationActor`
- `src/types/sales.ts` — defines `MutationActor`

## Acceptance Criteria

1. All files importing `MutationActor` from sales types update to import `Actor` from `@jurnapod/shared`
2. `MutationActor` is replaced with `Actor` in all type definitions and function signatures
3. Local `MutationActor` type definitions are removed from all four type files
4. Service signatures are updated to use shared `Actor`
5. `npm run typecheck -w @jurnapod/modules-sales` passes

## Technical Notes

- `MutationActor` in sales modules had only `userId: number`
- The shared `Actor` has additional optional fields `outletId?` and `ipAddress?` which may be used by some operations
- When replacing `MutationActor` with `Actor`, some services may need their actor parameters adjusted

## Tasks

- [ ] Update `packages/modules/sales/src/types/payments.ts` to import `Actor` from shared
- [ ] Update `packages/modules/sales/src/types/invoices.ts` to import `Actor` from shared
- [ ] Update `packages/modules/sales/src/types/credit-notes.ts` to import `Actor` from shared
- [ ] Update `packages/modules/sales/src/types/sales.ts` to import `Actor` from shared
- [ ] Replace all `MutationActor` references with `Actor`
- [ ] Remove local `MutationActor` type definitions from all type files
- [ ] Update service files that use `MutationActor`
- [ ] Run typecheck and fix any issues
- [ ] Verify tests pass

## Validation

```bash
npm run typecheck -w @jurnapod/modules-sales
```
