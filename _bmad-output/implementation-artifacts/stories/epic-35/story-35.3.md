# Story 35.3: Migrate modules-platform to Shared Actor

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-35.3 |
| Title | Migrate modules-platform to Shared Actor |
| Status | pending |
| Type | Refactor |
| Sprint | TBD |
| Priority | P1 |
| Estimate | 2-4h |

## Story

As a platform engineer, I want to replace `CompanyActor` in `modules-platform` with the shared `Actor` type, so that the platform module uses a single unified actor definition.

## Background

This story migrates the `modules-platform` package to use the canonical `Actor` interface from `@jurnapod/shared`. After this story, the local actor type `CompanyActor` should be removed and replaced with imports from shared.

Affected file in `modules-platform`:
- `src/companies/types/company.ts` — defines `CompanyActor`

## Acceptance Criteria

1. `packages/modules/platform/src/companies/types/company.ts` imports `Actor` from `@jurnapod/shared`
2. All references to `CompanyActor` are updated to use `Actor`
3. Local `CompanyActor` type definition is removed
4. Service signatures are updated to use shared `Actor`
5. `npm run typecheck -w @jurnapod/modules-platform` passes

## Technical Notes

- `CompanyActor` had fields: `userId: number`, `outletId?: number | null`, `ipAddress?: string | null`
- The shared `Actor` has all required fields: `userId`, `outletId?`, `ipAddress?`
- Ensure all API wrappers that construct actors are updated to match

## Tasks

- [ ] Update `packages/modules/platform/src/companies/types/company.ts` to import `Actor` from shared
- [ ] Replace `CompanyActor` with `Actor` in all type definitions and function signatures
- [ ] Remove local `CompanyActor` type definition
- [ ] Update service files that use `CompanyActor`
- [ ] Run typecheck and fix any issues
- [ ] Verify tests pass

## Validation

```bash
npm run typecheck -w @jurnapod/modules-platform
```
