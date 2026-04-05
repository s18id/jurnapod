# Story 33.2: Migrate `@jurnapod/auth` to Shared Constants

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-33.2 |
| Title | Migrate `@jurnapod/auth` to Shared Constants |
| Status | pending |
| Type | Refactoring |
| Sprint | 1 of 1 |
| Priority | P1 |
| Estimate | 4h |

---

## Story

As a Platform Engineer,
I want `@jurnapod/auth` to import permission constants from `@jurnapod/shared`,
So that there is a single source of truth and auth uses the correct bit values.

---

## Background

`@jurnapod/auth/src/rbac/permissions.ts` defines:
```typescript
const MODULE_PERMISSION_BITS = { READ: 1, WRITE: 2, DELETE: 4 };
```

Problems:
1. **Bit mismatch**: `WRITE=2` but `CREATE=2` in platform — creates confusion
2. **Missing bits**: No `CREATE`, `UPDATE`, `REPORT` — only handles READ, WRITE, DELETE
3. **Duplicate**: Same concept defined elsewhere

After migration, auth must use:
- `PERMISSION_BITS.READ` instead of `MODULE_PERMISSION_BITS.READ`
- `PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE` instead of `MODULE_PERMISSION_BITS.WRITE`
- `PERMISSION_BITS.DELETE` instead of `MODULE_PERMISSION_BITS.DELETE`

---

## Acceptance Criteria

1. `packages/auth/src/rbac/permissions.ts`:
   - REMOVE: `MODULE_PERMISSION_BITS` definition
   - ADD: `import { PERMISSION_BITS, PERMISSION_MASK } from "@jurnapod/shared"`
   - UPDATE: All internal usages to use shared constants

2. `packages/auth/src/rbac/access-check.ts`:
   - UPDATE: `hasPermission()` calls to use `PERMISSION_BITS.CREATE` instead of `WRITE`
   - ADD: SUPER_ADMIN bypass in `getUserWithRoles()` and `getUserForTokenVerification()`
   - ADD: `isSuperAdminUser()` private helper (queries `user_role_assignments` for SUPER_ADMIN globally)

3. Any other files in `@jurnapod/auth` using hardcoded permission bits must be updated

4. `npm run typecheck -w @jurnapod/auth` passes

5. `npm run build -w @jurnapod/auth` passes

---

## Dev Notes

- Auth uses bit values differently than platform:
  - Platform: `CREATE=2, UPDATE=4, DELETE=8`
  - Auth old: `WRITE=2, DELETE=4` (shifted!)
- New mapping:
  - Auth `hasPermission(READ)` → `PERMISSION_BITS.READ`
  - Auth `hasPermission(WRITE)` → `PERMISSION_BITS.CREATE | PERMISSION_BITS.UPDATE`
  - Auth `hasPermission(DELETE)` → `PERMISSION_BITS.DELETE`

- `isSuperAdminUser()` must check globally without `company_id` filter (SUPER_ADMIN is platform-wide)

---

## Validation

```bash
npm run typecheck -w @jurnapod/auth
npm run build -w @jurnapod/auth
```
