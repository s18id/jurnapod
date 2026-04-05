# Epic 33: Permission System Consolidation

**Status:** in-progress  
**Date:** 2026-04-05  
**Stories:** 4 total  

---

## Executive Summary

Epic 33 consolidates the fragmented permission system that has drifted across `@jurnapod/auth`, `@jurnapod/modules-platform`, and `@jurnapod/shared`. The root cause: duplicate constant definitions with conflicting bit values and two conflated "module" concepts.

**Key Goals:**
- Single source of truth for permission bits (`READ`, `CREATE`, `UPDATE`, `DELETE`, `REPORT`)
- Separate access modules (authorization) from feature modules (enablement)
- Fix SUPER_ADMIN login bypass when company is disabled
- Remove all duplicate permission constant definitions

---

## Problem Statement

### Conflicting Permission Bits

| Location | Constant | Bits | Problem |
|----------|----------|------|---------|
| `modules-platform/companies/constants/permission-matrix.ts` | `PERMISSION_MASK` | READ=1, CREATE=2, UPDATE=4, DELETE=8, ANALYTIC=16 | Uses ANALYTIC |
| `modules-platform/users/types/permission.ts` | `MODULE_PERMISSIONS` | READ=1, WRITE=2, ADMIN=4 | Dead 3-bit system |
| `@jurnapod/auth/src/rbac/permissions.ts` | `MODULE_PERMISSION_BITS` | READ=1, WRITE=2, DELETE=4 | Bit 2 = WRITE vs CREATE |

### Conflated Module Concepts

1. **Access modules** (RBAC authorization): `users`, `roles`, `companies`, `sales`
2. **Feature modules** (enablement): `platform`, `pos`, `sales`, `inventory`

Both used interchangeably as `module` string — causes confusion and potential bugs.

### SUPER_ADMIN Login Bug

`findUserForLogin()` and `getUserWithRoles()` check `company.deleted_at IS NULL` unconditionally. SUPER_ADMIN users cannot login if their company is deactivated — despite being a global platform role.

---

## Architecture

### Dependency Direction

```
packages/shared/src/constants/
  ├── rbac.ts        ← PERMISSION_BITS, PERMISSION_MASK (SINGLE SOURCE)
  └── modules.ts     ← ACCESS_MODULE_CODES, FEATURE_MODULE_CODES

         ↓
packages/auth/src/rbac/permissions.ts     ← Import from shared
packages/modules/platform/                  ← Import from shared
         ↓
apps/api/src/lib/auth.ts                  ← SUPER_ADMIN bypass
```

### No Aliases

All duplicate constants are **removed**, not aliased. No backward compatibility layer that could cause future drift.

---

## Success Criteria

- [ ] Shared contracts in `@jurnapod/shared`
- [ ] All auth permission checks use shared constants
- [ ] All platform permission defaults use shared constants
- [ ] `SUPER_ADMIN` can login when company disabled
- [ ] No duplicate permission constants anywhere in codebase
- [ ] `npm run typecheck --workspaces --if-present` passes
- [ ] `npm run build --workspaces --if-present` passes

---

## Stories

| # | Title | Status |
|---|-------|--------|
| [story-33.1](./story-33.1.md) | Create shared RBAC contracts | pending |
| [story-33.2](./story-33.2.md) | Migrate `@jurnapod/auth` to shared | pending |
| [story-33.3](./story-33.3.md) | Migrate `modules-platform` to shared | pending |
| [story-33.4](./story-33.4.md) | Fix SUPER_ADMIN login bypass | pending |
