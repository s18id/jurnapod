<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# ADR-0005: Layered Auth Guard Composition

**Status:** Accepted
**Date:** 2026-03-25
**Deciders:** Ahmad Faruk (Signal18 ID)
**Epic:** Epic 1 (Auth foundation), Epic 9 (RBAC), Epic 14/15 (Hono migration)

---

## Context

Every API route needs some combination of:

1. **Authentication** — is the caller who they say they are?
2. **Role check** — does the caller hold a role that allows this action?
3. **Module permission check** — is the relevant module enabled and does the caller have read/write/report access?
4. **Outlet access check** — does the caller have access to the specific outlet this operation targets?

These checks are independent but always layered in the same order. Before Hono, they were scattered across route files with no shared interface. Some routes missed outlet checks; others duplicated role checks.

---

## Decision

Authentication and authorization are separated into distinct, composable layers.

### Layer 1 — Authentication (middleware, per route group)

Each route group installs a Hono middleware that calls `authenticateRequest()` and stores the result in Hono context:

```typescript
salesRoutes.use("/*", async (c, next) => {
  const authResult = await authenticateRequest(c.req.raw);
  if (!authResult.success) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", ... } }, 401);
  }
  c.set("auth", authResult.auth);
  await next();
});
```

`authenticateRequest()` extracts the `Authorization: Bearer <JWT>` header, verifies it with JOSE (`jwtVerify`, HS256), and validates the claims via Zod:

```typescript
const accessTokenClaimsSchema = z.object({
  sub: z.string().trim().min(1),
  company_id: z.coerce.number().int().positive(),
  email: z.string().trim().email().optional()
});

export type AuthContext = {
  userId: number;
  companyId: number;
  email: string | null;
  role: RoleCode | null;
};
```

The `AuthContext` is available to all downstream handlers via `c.get("auth")`.

### Layer 2 — Authorization (per handler, via guard functions)

Handlers call guard functions directly. Guards are plain async functions with a shared signature:

```typescript
type AuthenticatedRouteGuard = (
  request: Request,
  auth: AuthContext
) => Promise<Response | null>;
// Returns null = access granted, Response = access denied (403/400)
```

Three guard constructors cover all cases:

```typescript
// Role check
requireRole(["OWNER", "ADMIN"])

// Module permission check (uses bitmask: create=1, read=2, update=4, delete=8, report=16)
requireModulePermission("sales", "read")

// Flexible combination
requireAccess({
  roles: ["CASHIER"],
  module: "pos",
  permission: "create",
  outletId: (req, auth) => extractOutletIdFromBody(req)  // resolver function
})
```

The `checkUserAccess()` function hits a single SQL query that checks global role assignments (`is_global=1`) and outlet-scoped assignments (`outlet_id = ?`) simultaneously:

```sql
SELECT r.code, ura.outlet_id, r.is_global,
       mrp.permission_mask
FROM user_role_assignments ura
JOIN roles r ON r.id = ura.role_id
LEFT JOIN module_role_permissions mrp
  ON mrp.role_id = r.id AND mrp.module_code = ?
WHERE ura.user_id = ? AND ura.company_id = ?
  AND (r.is_global = 1 OR ura.outlet_id = ?)
```

Module permissions use a bitmask stored in `permission_mask` (`INT`). Guard code ANDs against the relevant bit:

```
create=1, read=2, update=4, delete=8, report=16
```

### Role hierarchy

```
SUPER_ADMIN  → platform-wide, bypasses all company/outlet checks
OWNER        → company-level, all modules
COMPANY_ADMIN / ADMIN → company-level, configurable modules
ACCOUNTANT   → company-level, accounting + reports
CASHIER      → outlet-level, POS operations
```

### SUPER_ADMIN platform-wide bypass (in `checkAccess()`)

`SUPER_ADMIN` is handled specially inside `RBACManager.checkAccess()`:

1. **`isSuperAdminUser(userId)`** — queried first using a global lookup on `user_role_assignments` (no `company_id` filter), since SUPER_ADMIN is platform-wide
2. **User existence** — if the user is SUPER_ADMIN, the `company.deleted_at IS NULL` check is bypassed (SUPER_ADMIN can access even if their home company is soft-deleted)
3. **Module permission bitmask** — if the user is SUPER_ADMIN, `hasPermission = true` immediately without querying `module_roles`

This means SUPER_ADMIN always returns `hasPermission = true` for any `module/permission` check, regardless of `module_roles` entries.

### Outlet access check

For outlet-scoped operations, outlet access is validated explicitly after role/module checks:

```typescript
const hasAccess = await userHasOutletAccess(auth.userId, auth.companyId, outletId);
if (!hasAccess) return errorResponse("FORBIDDEN", "Forbidden", 403);
```

`userHasOutletAccess()` reuses the same role assignment query — it returns `true` if the user has a global role or an outlet-specific assignment for the given outlet.

---

## Alternatives Considered

### Single `withAuth(handler, guards[])` wrapper

An earlier version of `auth-guard.ts` exposed a `withAuth()` wrapper that accepted an array of guards and ran them sequentially. This was replaced by calling guards directly in handlers because the wrapper added indirection without reducing boilerplate — handlers still needed to pass the `auth` context to business logic, and the wrapper obscured which guards were applied.

### CASL / attribute-based access control

Evaluated but rejected. CASL adds a dependency and a permission modeling layer that doesn't map cleanly to the module/permission bitmask schema already in the database. The bitmask approach is simpler to query, easier to audit, and already enforced at the database layer via `module_role_permissions`.

### Middleware-per-permission

Rejected. Applying a Hono middleware for each permission combination (e.g., `salesReadMiddleware`, `salesCreateMiddleware`) would create a large number of middleware instances and make the middleware stack order fragile. Per-handler guard calls are explicit and colocated with the handler logic.

---

## Consequences

### Positive

- Auth context is guaranteed to be present for any handler that runs after the group middleware — no null checks needed in handlers.
- Guards are composable and independently testable as plain async functions.
- Permission model is stored in the database (`module_role_permissions`) — role permissions can be updated without code changes.
- A single access check query fetches role, module permission, and outlet access together — no N+1 queries for auth.

### Negative / Trade-offs

- Guards are called inside handlers rather than declared at routing time. A missed guard call is a silent security hole — it won't fail at startup.
- `c.get("auth")` requires a TypeScript cast (`as AuthContext`) where Hono's generic typing doesn't propagate — the module augmentation in `lib/auth-guard.ts` mitigates this but must be kept in sync.
- The bitmask permission model limits permissions to 64 bits (INT). Sufficient for current modules but would need a schema change if permissions exceeded this range.

---

## References

- `apps/api/src/lib/auth.ts` — JWT verification, `authenticateRequest()`
- `apps/api/src/lib/auth-guard.ts` — guard constructors, `checkUserAccess()`, `userHasOutletAccess()`
- `apps/api/src/routes/sales/invoices.ts` — representative usage
- Epic 1: Auth foundation (JWT, login/logout/refresh)
- Epic 9: RBAC and outlet role assignment
- Story 1.3: RBAC role definitions and permissions
