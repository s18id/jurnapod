# Story 35.5: Migrate Remaining Packages

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-35.5 |
| Title | Migrate Remaining Packages |
| Status | pending |
| Type | Refactor |
| Sprint | TBD |
| Priority | P1 |
| Estimate | 4-6h |

## Story

As a platform engineer, I want to replace actor types in accounting, treasury, and inventory modules with the shared `Actor` type, so that all modules use a single unified actor definition.

## Background

This story migrates the remaining packages to use the canonical `Actor` interface from `@jurnapod/shared`. After this story, local actor type definitions in these packages should be removed.

Affected packages:
- `modules-accounting/fixed-assets` — defines `MutationAuditActor` in multiple service files
- `modules-treasury` — defines `MutationActor` in `ports.ts`
- `modules-inventory` — defines `MutationAuditActor` in `interfaces/shared.ts`

## Acceptance Criteria

1. `packages/modules/accounting/src/fixed-assets/services/*.ts` imports `Actor` from shared
2. `packages/modules/treasury/src/ports.ts` imports `Actor` from shared
3. `packages/modules/inventory/src/interfaces/shared.ts` imports `Actor` from shared
4. All local `MutationAuditActor` and `MutationActor` types in these packages are removed
5. Service signatures are updated to use shared `Actor`
6. `npm run typecheck` passes for all affected packages

## Technical Notes

- `MutationAuditActor` in accounting/fixed-assets had: `userId: number`, `canManageCompanyDefaults?: boolean`
- `MutationActor` in treasury had: `userId: number`
- `MutationAuditActor` in inventory had: `userId: number`, `canManageCompanyDefaults?: boolean`
- The shared `Actor` has: `userId: number`, `outletId?: number | null`, `ipAddress?: string | null`
- The `canManageCompanyDefaults` field is inventory-specific and may need to be handled separately

## Tasks

- [ ] Update fixed-assets service files to import `Actor` from shared
- [ ] Replace `MutationAuditActor` with `Actor` in accounting/fixed-assets services
- [ ] Update `packages/modules/treasury/src/ports.ts` to import and use `Actor`
- [ ] Update `packages/modules/inventory/src/interfaces/shared.ts` to import `Actor`
- [ ] Remove local actor type definitions
- [ ] Update all consuming service files
- [ ] Run typecheck for all affected packages
- [ ] Verify tests pass

## Validation

```bash
npm run typecheck -w @jurnapod/modules-accounting
npm run typecheck -w @jurnapod/modules-treasury
npm run typecheck -w @jurnapod/modules-inventory
```
