# Story 33.1: Create Shared RBAC Contracts

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-33.1 |
| Title | Create Shared RBAC Contracts |
| Status | pending |
| Type | Architecture |
| Sprint | 1 of 1 |
| Priority | P1 |
| Estimate | 4h |

---

## Story

As a Platform Engineer,
I want permission bits and module codes defined in one place (`@jurnapod/shared`),
So that all packages reference the same constants and drift is impossible.

---

## Background

Currently there are THREE conflicting permission constant definitions:
1. `modules-platform/companies/constants/permission-matrix.ts` — `PERMISSION_MASK` (ANALYTIC=16)
2. `modules-platform/users/types/permission.ts` — `MODULE_PERMISSIONS` (3-bit, dead code)
3. `@jurnapod/auth/src/rbac/permissions.ts` — `MODULE_PERMISSION_BITS` (WRITE=2 vs CREATE=2 mismatch)

Additionally, "module" is used for both:
- Access modules (authorization): `users`, `roles`, `sales`
- Feature modules (enablement): `platform`, `pos`, `inventory`

---

## Acceptance Criteria

1. `@jurnapod/shared/src/constants/rbac.ts` exists with:
   - `PERMISSION_BITS`: `{ READ: 1, CREATE: 2, UPDATE: 4, DELETE: 8, REPORT: 16 }`
   - `PERMISSION_MASK`: `{ READ, WRITE: CREATE|UPDATE, CRUD, CRUDA }`
   
2. `@jurnapod/shared/src/constants/modules.ts` exists with:
   - `ACCESS_MODULE_CODES`: array of access module strings
   - `FEATURE_MODULE_CODES`: array of feature module strings

3. All constants are `as const` (narrow types, not `string[]`)

4. `packages/shared/src/index.ts` exports both new modules

---

## Technical Notes

### New File: `packages/shared/src/constants/rbac.ts`

```typescript
/**
 * Canonical permission bit definitions for RBAC.
 * All packages must use these constants — no local duplicates.
 */
export const PERMISSION_BITS = {
  READ:    1,    // 0b00001
  CREATE:  2,    // 0b00010
  UPDATE:  4,    // 0b00100
  DELETE:  8,   // 0b01000
  REPORT:  16,   // 0b10000
} as const;

export type PermissionBit = keyof typeof PERMISSION_BITS;

// Composite masks
export const PERMISSION_MASK = {
  READ:    PERMISSION_BITS.READ,
  WRITE:   PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE,
  CRUD:    PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE,
  CRUDA:   PERMISSION_BITS.READ | PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE | PERMISSION_BITS.DELETE | PERMISSION_BITS.REPORT,
} as const;
```

### New File: `packages/shared/src/constants/modules.ts`

```typescript
/**
 * Access modules — used in RBAC authorization checks.
 */
export const ACCESS_MODULE_CODES = [
  "users", "roles", "companies", "outlets",
  "accounts", "journals", "cash_bank",
  "sales", "payments", "inventory", "purchasing",
  "reports", "settings", "pos",
] as const;

export type AccessModuleCode = typeof ACCESS_MODULE_CODES[number];

/**
 * Feature modules — used in company_modules enablement table.
 */
export const FEATURE_MODULE_CODES = [
  "platform", "pos", "sales", "inventory",
  "accounting", "treasury", "reporting",
] as const;

export type FeatureModuleCode = typeof FEATURE_MODULE_CODES[number];
```

---

## Dev Notes

- **NO aliases** — constants are defined once, used everywhere
- Both files use `as const` for narrow types
- `PERMISSION_BITS.CREATE` (not `WRITE`) — this resolves the auth/platform naming conflict
- `PERMISSION_MASK.CRUD = 15`, `PERMISSION_MASK.CRUDA = 31` — matches DB column width

---

## Validation

```bash
npm run typecheck -w @jurnapod/shared
npm run build -w @jurnapod/shared
```
