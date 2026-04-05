# Story 33.3: Migrate `modules-platform` to Shared Constants

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-33.3 |
| Title | Migrate `modules-platform` to Shared Constants |
| Status | pending |
| Type | Refactoring |
| Sprint | 1 of 1 |
| Priority | P1 |
| Estimate | 4h |

---

## Story

As a Platform Engineer,
I want `modules-platform` to import permission constants from `@jurnapod/shared`,
So that there is a single source of truth and platform uses the correct bit values.

---

## Background

`modules-platform` has TWO conflicting permission constant files:

### File 1: `packages/modules/platform/src/companies/constants/permission-matrix.ts`
```typescript
export const PERMISSION_MASK = {
  READ: 1, CREATE: 2, UPDATE: 4, DELETE: 8, ANALYTIC: 16,
  CRUD: 15, CRUDA: 31
};
```

### File 2: `packages/modules/platform/src/users/types/permission.ts`
```typescript
// DEAD CODE — never used
export const MODULE_PERMISSIONS = {
  READ: 1, WRITE: 2, ADMIN: 4,
};
export const FULL_PERMISSION_MASK = MODULE_PERMISSIONS.READ | MODULE_PERMISSIONS.WRITE | MODULE_PERMISSIONS.ADMIN; // = 7
```

Problems:
1. `MODULE_PERMISSIONS` is dead code (never used anywhere)
2. `FULL_PERMISSION_MASK = 7` is wrong — should be 31 (CRUDA)
3. `ANALYTIC` naming vs `REPORT` in auth

---

## Acceptance Criteria

1. `packages/modules/platform/src/companies/constants/permission-matrix.ts`:
   - REMOVE: `PERMISSION_MASK` local definition
   - ADD: `import { PERMISSION_BITS, PERMISSION_MASK } from "@jurnapod/shared"`
   - UPDATE: `MODULE_ROLE_DEFAULTS` to use `PERMISSION_MASK.CRUD`, `PERMISSION_MASK.READ`, etc.

2. `packages/modules/platform/src/users/types/permission.ts`:
   - REMOVE: `MODULE_PERMISSIONS` (dead code)
   - REMOVE: `ModulePermission` type
   - ADD: `import { PERMISSION_BITS, PERMISSION_MASK } from "@jurnapod/shared"`
   - UPDATE: `FULL_PERMISSION_MASK = PERMISSION_MASK.CRUDA` (31)

3. `packages/modules/platform/src/users/services/role-service.ts`:
   - UPDATE: Already uses `FULL_PERMISSION_MASK` — should now resolve to 31

4. Any other files using local permission constants must be updated

5. `npm run typecheck -w @jurnapod/modules-platform` passes

6. `npm run build -w @jurnapod/modules-platform` passes

---

## Dev Notes

- `permission-matrix.ts` exports `MODULE_ROLE_DEFAULTS` which seeds default permissions for new companies
- After migration, `MODULE_ROLE_DEFAULTS` should use:
  - `PERMISSION_MASK.CRUD` instead of hardcoded `15`
  - `PERMISSION_MASK.CRUDA` instead of hardcoded `31`
  - `PERMISSION_MASK.READ` instead of hardcoded `1`
- `users/types/permission.ts` — the dead `MODULE_PERMISSIONS` code can be deleted entirely

---

## Validation

```bash
npm run typecheck -w @jurnapod/modules-platform
npm run build -w @jurnapod/modules-platform
```
