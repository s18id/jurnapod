# Story 33.4: Fix SUPER_ADMIN Login Bypass

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-33.4 |
| Title | Fix SUPER_ADMIN Login Bypass |
| Status | pending |
| Type | Bug Fix |
| Sprint | 1 of 1 |
| Priority | P1 |
| Estimate | 4h |

---

## Story

As a Platform Engineer,
I want SUPER_ADMIN users to be able to login even when their company is deactivated,
So that platform administrators can always access the system for recovery purposes.

---

## Background

### Current Bug

Three locations check `company.deleted_at IS NULL` and block all users if company is deleted:

| Location | Function | Problem |
|----------|----------|---------|
| `apps/api/src/lib/auth.ts:122` | `findUserForLogin()` | Login fails for all users if company disabled |
| `packages/auth/src/rbac/access-check.ts:202` | `getUserWithRoles()` | `/me` endpoint fails for all users |
| `packages/auth/src/rbac/access-check.ts:301` | `getUserForTokenVerification()` | Token verification fails for all users |

### Business Rule

SUPER_ADMIN is a **global platform role** — not scoped to any company. If a SUPER_ADMIN's company is deactivated, they should still be able to:
1. Login to the platform
2. View their profile
3. Verify their access token

### Architecture Decision

Per bmad-agent-architect guidance: `@jurnapod/auth` should NOT import from `modules-platform`. The SUPER_ADMIN check must be implemented via direct DB query within auth packages.

---

## Acceptance Criteria

### 1. `apps/api/src/lib/auth.ts` — `findUserForLogin()`

- Query user WITHOUT `company.deleted_at` check first
- If company deleted AND user is not SUPER_ADMIN → return null
- If company deleted AND user IS SUPER_ADMIN → allow (bypass)
- Add `checkUserHasSuperAdminRole()` helper (direct DB query)

### 2. `packages/auth/src/rbac/access-check.ts` — `getUserWithRoles()`

- Add `isSuperAdminUser()` private helper
- After fetching user row, if `company.deleted_at IS NOT NULL` AND NOT superadmin → return null
- If company deleted AND IS superadmin → continue

### 3. `packages/auth/src/rbac/access-check.ts` — `getUserForTokenVerification()`

- Same bypass logic as `getUserWithRoles()`

### 4. Rule: SUPER_ADMIN Check

```typescript
// Check globally — no company_id filter
async function isSuperAdminUser(userId: number): Promise<boolean> {
  const row = await db
    .selectFrom("user_role_assignments as ura")
    .innerJoin("roles as r", "r.id", "ura.role_id")
    .where("ura.user_id", "=", userId)
    .where("r.code", "=", "SUPER_ADMIN")
    .where("ura.outlet_id", "is", null)
    .select(["ura.id"])
    .executeTakeFirst();
  return row !== undefined;
}
```

### 5. Validation

- `npm run typecheck -w @jurnapod/auth` passes
- `npm run typecheck -w @jurnapod/api` passes
- `npm run build -w @jurnapod/auth` passes
- `npm run build -w @jurnapod/api` passes

---

## Dev Notes

- **No package boundary change** — auth does direct DB query for SUPER_ADMIN
- This is an auth policy fix, not a domain logic extraction
- The bypass rule: `user EXISTS AND (company.active OR user.isSuperAdmin)`
- `isSuperAdminUser()` must query WITHOUT `company_id` filter — SUPER_ADMIN is global

---

## Validation

```bash
npm run typecheck -w @jurnapod/auth
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/auth
npm run build -w @jurnapod/api
```
