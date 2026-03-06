<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# ACL Next Steps Plan

**Scope:** permission enforcement, test coverage, SUPER_ADMIN policy review
**Date:** 2026-03-06

This plan consolidates the remaining work after the outlet role ACL changes and integration tests.

## Decisions (Confirmed)

- Reports use module `reports` with `read` permission.
- Journals use module `journals` with `read/create` permissions.
- Audit logs use module `settings` with `read` permission.
- SUPER_ADMIN has cross-company access when `company_id` is explicit.
- Cross-company audit logging applies to writes only.
- Guard migration should refine module permissions (not role-only parity).
- Test order: unit tests first, then integration tests.

---

## 1) Module Permission Enforcement

**Goal:** add consistent module permission checks to routes currently using role-only guards or inline checks.

### 1.1 Priority Targets (from `docs/route-permission-audit.md`)

**High priority (write paths):**
- `/api/sales/invoices` POST (manual access check)
- `/api/sales/payments` POST (manual access check)
- `/api/journals` POST (manual access check)
- `/api/inventory/item-prices` POST (manual access check)

**Medium priority (read paths with sensitive data):**
- `/api/reports/*` (all report endpoints)
- `/api/journals` GET
- `/api/journals/[batchId]` GET
- `/api/audit-logs` GET

**Medium priority (accounts core):**
- `/api/accounts` GET/POST
- `/api/accounts/[accountId]` GET/PUT/DELETE
- `/api/accounts/tree` GET
- `/api/accounts/fiscal-years*` GET/POST/PUT
- `/api/accounts/[accountId]/usage` GET
- `/api/accounts/[accountId]/reactivate` POST

### 1.2 Guard Pattern

- Prefer `requireAccess` for company-wide routes.
- Prefer `requireAccessForOutletQuery` for outlet-scoped GETs.
- If outlet ID is in the body, use `requireAccess` with `outletId` resolver.
- Use module mapping:
  - Reports -> `reports`
  - Journals -> `journals`
  - Audit logs -> `settings`

**Example (write):**
```ts
requireAccess({
  roles: ["OWNER", "COMPANY_ADMIN", "ADMIN", "ACCOUNTANT"],
  module: "accounts",
  permission: "update"
})
```

### 1.3 Rollout Strategy

1. Replace empty guard arrays (manual access checks) with `requireAccess`.
2. Add module+permission checks to role-only guards.
3. Keep behavior stable by mapping current roles to modules first, then refine.

---

## 2) Unit Tests for `checkUserAccess`

**Goal:** unit coverage for global/outlet roles, permissions, outlet access, and edge cases.

### 2.1 Recommended Test Matrix

- Global roles: OWNER/COMPANY_ADMIN hasRole=true
- Outlet roles: ADMIN/CASHIER hasRole=true with outletId
- Outlet roles without outletId: hasRole=true (company-wide access)
- Outlet access: global roles pass any outlet; outlet roles only assigned outlet
- Module permissions: read/create/update/delete bitmask
- SUPER_ADMIN bypass: isSuperAdmin=true, permission bypass
- Inactive user / deleted company -> null

### 2.2 Location

- `apps/api/src/lib/auth.test.ts`
- Use integration harness DB access for setup/teardown

---

## 3) Integration Test Plan

**Goal:** ensure end-to-end ACL behavior with real routes.

### 3.1 Current Coverage

- `apps/api/tests/integration/outlet-role-acl.integration.test.mjs` (passes)

### 3.2 Additions

- Add a sales write test where role has `sales:read` only -> expect 403
- Add a reports read test with missing `reports:read` -> expect 403 (after enforcement)
- Add a journals post test with missing `journals:create` -> expect 403

### 3.3 Execution

```bash
npm run test:integration -w @jurnapod/api -- tests/integration/outlet-role-acl.integration.test.mjs
```

---

## 4) SUPER_ADMIN Cross-Company Policy Review

**Goal:** document cross-company access boundaries and audit logging.

### 4.1 Current Behavior

- SUPER_ADMIN can access other companies when `company_id` is explicitly provided.
- Non-SUPER_ADMIN gets 400/403 for cross-company attempts.

### 4.2 Decisions (Confirmed)

1. Cross-company access is allowed when `company_id` is explicit.
2. Apply to admin endpoints: companies, outlets, users, settings.
3. Audit logging is required for cross-company writes only.

### 4.3 Suggested Guard Rule

- Keep explicit `company_id` checks in handlers.
- Use `checkUserAccess` with `allowedRoles: ["SUPER_ADMIN"]` to validate.
- Add audit logging for cross-company writes (not reads).

---

## 5) Order of Execution

1. Add unit tests for `checkUserAccess`.
2. Add permission guards to write routes (manual checks -> guards).
3. Add permission guards to sensitive read routes (reports/journals/audit logs).
4. Expand integration tests for new guards.
5. Implement SUPER_ADMIN policy decisions and update guard patterns.

---

## 6) Deliverables

- Updated route guards for sales/journals/reports/accounts/audit logs
- `apps/api/src/lib/auth.test.ts`
- Additional integration test coverage
- Updated docs for SUPER_ADMIN policy decisions
