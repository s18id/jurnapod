# Story 35.1: Add Actor to Shared Package

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-35.1 |
| Title | Add Actor to Shared Package |
| Status | pending |
| Type | Refactor |
| Sprint | TBD |
| Priority | P1 |
| Estimate | 2-4h |

## Story

As a platform engineer, I want to create a unified `Actor` interface in `@jurnapod/shared`, so that all modules can import a single canonical actor type instead of maintaining duplicate local definitions.

## Background

Epic 35 aims to unify the multiple actor type definitions scattered across modules into a single shared interface. This story creates the canonical `Actor` type in `@jurnapod/shared` that will be adopted by all consuming modules in subsequent stories.

Currently there are multiple local actor type definitions:
- `ReservationGroupActor` in `modules-reservations` (fields: `userId`, `ipAddress?`)
- `OutletTableActor` in `modules-reservations` (fields: `userId`, `outletId?`, `ipAddress?`)
- `CompanyActor` in `modules-platform` (fields: `userId`, `outletId?`, `ipAddress?`)
- `MutationActor` in `modules-sales` (fields: `userId`)
- `MutationActor` in `modules-treasury` (fields: `userId`)
- `MutationAuditActor` in `modules-accounting/fixed-assets` (fields: `userId`, `canManageCompanyDefaults?`)
- `MutationAuditActor` in `modules-inventory` (fields: `userId`, `canManageCompanyDefaults?`)

## Acceptance Criteria

1. `packages/shared/src/schemas/actor.ts` is created with `Actor` interface
2. `Actor` interface has fields: `userId: number`, `outletId?: number | null`, `ipAddress?: string | null`
3. `Actor` is exported from `packages/shared/src/index.ts`
4. Zod schema for Actor is created if appropriate
5. `npm run typecheck -w @jurnapod/shared` passes

## Technical Notes

- The `Actor` interface should be simple and minimal to serve as a universal actor type
- Consider creating a base `ActorSchema` in Zod for potential validation at API boundaries
- The `outletId` field is optional because not all operations are scoped to an outlet
- Use `number | null` (not `undefined`) for nullable fields to match existing conventions

## Tasks

- [ ] Create `packages/shared/src/schemas/actor.ts` with `Actor` interface and Zod schema
- [ ] Export `Actor` from `packages/shared/src/index.ts`
- [ ] Verify typecheck passes
- [ ] Verify no existing actor types are broken by the new exports

## Validation

```bash
npm run typecheck -w @jurnapod/shared
```
