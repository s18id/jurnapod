<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# ACL & Authorization Guide

**Product:** Jurnapod  
**Last Updated:** 2026-03-06

This guide documents the Access Control List (ACL) and authorization model for Jurnapod, covering role scopes, outlet access, and module permissions.

---

## Table of Contents

- [Role Scope Model](#role-scope-model)
- [ACL Decision Tree](#acl-decision-tree)
- [Function Usage Guide](#function-usage-guide)
- [Route Guard Patterns](#route-guard-patterns)
- [Module Permissions](#module-permissions)
- [Testing Guidelines](#testing-guidelines)

---

## Role Scope Model

Jurnapod supports **two role scopes**: global (company-wide) and outlet-scoped.

### Role Definitions

| Role Code | Scope | `is_global` | `role_level` | Outlet Access | Permission Source |
|-----------|-------|-------------|--------------|---------------|-------------------|
| `SUPER_ADMIN` | Cross-company | 1 | 100 | All outlets (all companies) | Bypasses all checks |
| `OWNER` | Company-wide | 1 | 90 | All outlets (own company) | `module_roles` table |
| `COMPANY_ADMIN` | Company-wide | 1 | 80 | All outlets (own company) | `module_roles` table |
| `ADMIN` | Outlet-scoped | 0 | 60 | Assigned outlets only | `module_roles` table |
| `ACCOUNTANT` | Outlet-scoped | 0 | 40 | Assigned outlets only | `module_roles` table |
| `CASHIER` | Outlet-scoped | 0 | 20 | Assigned outlets only | `module_roles` table |

### Storage

**Global roles:**
- Stored in: `user_role_assignments` table
- Join: `users → user_role_assignments → roles` (where `roles.is_global = 1`)
- Grants access to: All outlets within the user's company

**Outlet-scoped roles:**
- Stored in: `user_role_assignments` table
- Join: `users → user_role_assignments → outlets + roles` (where `roles.is_global = 0`)
- Grants access to: Only assigned outlets (via `user_role_assignments.outlet_id`)

### Key Behaviors

#### Global Roles
- **SUPER_ADMIN**: Can access all companies and all outlets (platform-level)
- **OWNER, COMPANY_ADMIN**: Can access all outlets within their company
- Global roles bypass outlet access checks (automatically granted access to all outlets)

#### Outlet-Scoped Roles
- **ADMIN, ACCOUNTANT, CASHIER**: Can only access explicitly assigned outlets
- Outlet roles can still access company-wide routes (e.g., `/api/users`), but permissions control what actions they can perform
- Outlet access is verified via `user_role_assignments` table

---

## ACL Decision Tree

Use this decision tree to determine which authorization pattern to apply.

```
┌─────────────────────────────────────────────────────────────────┐
│ Route Authorization Decision Tree                               │
└─────────────────────────────────────────────────────────────────┘

1. Is route company-wide (users, companies, etc.)?
   ├─ YES: Use requireAccess({ roles, module, permission })
   │   ├─ Accepts global OR outlet roles
   │   ├─ User with outlet role can view company data
   │   │  (permissions control what actions they can perform)
   │   └─ Example: User with outlet ADMIN can list users,
   │      but cannot create users (missing "create" permission)
   │
   └─ NO: Route is outlet-specific (settings, POS sync, etc.)
       └─ Use requireAccessForOutletQuery({
            roles, module, permission, outletParam
          })
           ├─ Checks: hasRole + hasPermission + hasOutletAccess
           ├─ Global roles bypass outlet access check
           │  (automatically access all outlets)
           └─ Outlet roles checked against user_role_assignments

2. Does route need cross-company access (SUPER_ADMIN)?
   ├─ Check: if (targetCompanyId !== auth.companyId) {
   │           verify SUPER_ADMIN via checkUserAccess
   │         }
   ├─ SUPER_ADMIN bypasses company_id matching
   └─ Example: GET /api/outlets?company_id=123
       (only SUPER_ADMIN can access other companies)

3. Module permissions (bitwise mask):
   ├─ Stored in: module_roles table
   ├─ Bits: create=1, read=2, update=4, delete=8
   ├─ Combined with OR: create+read = 3, all=15
   └─ SUPER_ADMIN bypasses permission checks
       (isSuperAdmin returns true, skips permission mask check)
```

---

## Function Usage Guide

### Primary Function: `checkUserAccess`

**Use `checkUserAccess` for all authorization checks.**

This function performs comprehensive access control including role checks, outlet access verification, and module permission validation.

#### Signature

```typescript
export async function checkUserAccess(
  options: AccessCheckOptions
): Promise<AccessCheckResult | null>

interface AccessCheckOptions {
  userId: number;
  companyId: number;
  allowedRoles?: readonly RoleCode[];  // Optional: role check
  module?: string;                      // Optional: module permission check
  permission?: ModulePermission;        // Optional: specific permission
  outletId?: number;                    // Optional: outlet context
}

interface AccessCheckResult {
  isSuperAdmin: boolean;      // True if user has SUPER_ADMIN role
  hasGlobalRole: boolean;     // True if user has any global role
  hasRole: boolean;           // True if user has one of allowedRoles
  hasPermission: boolean;     // True if user has required permission
  hasOutletAccess: boolean;   // True if user has access to outlet
}
```

#### Examples

**Example 1: Check role only (company-wide)**
```typescript
const access = await checkUserAccess({
  userId: auth.userId,
  companyId: auth.companyId,
  allowedRoles: ["OWNER", "COMPANY_ADMIN", "ADMIN"]
});

if (!access?.hasRole) {
  return errorResponse("FORBIDDEN", "Forbidden", 403);
}
```

**Example 2: Check role + module permission (company-wide)**
```typescript
const access = await checkUserAccess({
  userId: auth.userId,
  companyId: auth.companyId,
  allowedRoles: ["OWNER", "ADMIN"],
  module: "users",
  permission: "create"
});

if (!access?.hasRole || (!access.hasPermission && !access.isSuperAdmin)) {
  return errorResponse("FORBIDDEN", "Forbidden", 403);
}
```

**Example 3: Check outlet-specific access**
```typescript
const access = await checkUserAccess({
  userId: auth.userId,
  companyId: auth.companyId,
  allowedRoles: ["OWNER", "ADMIN", "ACCOUNTANT"],
  module: "settings",
  permission: "update",
  outletId: parsed.outlet_id
});

if (!access?.hasRole) {
  return errorResponse("FORBIDDEN", "No required role", 403);
}
if (!access.hasPermission && !access.isSuperAdmin) {
  return errorResponse("FORBIDDEN", "No permission", 403);
}
if (!access.hasOutletAccess && !access.hasGlobalRole && !access.isSuperAdmin) {
  return errorResponse("FORBIDDEN", "No outlet access", 403);
}
```

**Example 4: Check SUPER_ADMIN for cross-company access**
```typescript
if (targetCompanyId !== auth.companyId) {
  const access = await checkUserAccess({
    userId: auth.userId,
    companyId: auth.companyId,
    allowedRoles: ["SUPER_ADMIN"]
  });
  
  const isSuperAdmin = access?.isSuperAdmin ?? false;
  if (!isSuperAdmin) {
    return errorResponse("FORBIDDEN", "Forbidden", 403);
  }
}
```

### Deprecated: `userHasAnyRole`

**⚠️ DEPRECATED: Use `checkUserAccess` instead.**

The `userHasAnyRole` function is deprecated and maintained only for backward compatibility. It does not support outlet context and may produce inconsistent results.

```typescript
// ❌ DO NOT USE (deprecated)
const hasRole = await userHasAnyRole(
  userId,
  companyId,
  ["ADMIN"]
);

// ✅ USE INSTEAD
const access = await checkUserAccess({
  userId,
  companyId,
  allowedRoles: ["ADMIN"]
});
const hasRole = access?.hasRole ?? false;
```

---

## Route Guard Patterns

### Pattern 1: Company-Wide Route

**Use Case:** Routes that show company-wide data (users, companies, outlets list)

**Guard:**
```typescript
export const GET = withAuth(
  async (request, auth) => {
    // Handler logic
    const users = await listUsers(auth.companyId);
    return successResponse(users);
  },
  [
    requireAccess({
      roles: ["OWNER", "COMPANY_ADMIN", "ADMIN"],
      module: "users",
      permission: "read"
    })
  ]
);
```

**Notes:**
- Accepts both global and outlet roles
- Outlet role users can view company-wide data
- Permissions control what actions they can perform

---

### Pattern 2: Outlet-Specific Route (Query Param)

**Use Case:** Routes that filter by outlet (settings, outlet mappings)

**Guard:**
```typescript
export const GET = withAuth(
  async (request, auth) => {
    const url = new URL(request.url);
    const outletId = Number(url.searchParams.get("outlet_id"));
    
    // Handler logic
    const settings = await getOutletSettings(auth.companyId, outletId);
    return successResponse(settings);
  },
  [
    requireAccessForOutletQuery({
      roles: ["OWNER", "ADMIN", "ACCOUNTANT"],
      module: "settings",
      permission: "read",
      outletParam: "outlet_id"  // default: "outlet_id"
    })
  ]
);
```

**Notes:**
- Automatically extracts `outlet_id` from query params
- Checks `hasRole + hasPermission + hasOutletAccess`
- Global roles bypass outlet access check

---

### Pattern 3: Outlet-Specific Route (Request Body)

**Use Case:** Routes where outlet ID is in request body (PUT/POST)

**Guard:**
```typescript
export const PUT = withAuth(
  async (request, auth) => {
    const payload = await request.json();
    const parsed = bodySchema.parse(payload);
    
    // Handler logic
    await updateOutletSettings(auth.companyId, parsed.outlet_id, parsed.settings);
    return successResponse(null);
  },
  [
    requireAccess({
      roles: ["OWNER", "ADMIN"],
      module: "settings",
      permission: "update",
      outletId: async (request, auth) => {
        const payload = await request.json();
        const parsed = bodySchema.parse(payload);
        return parsed.outlet_id;
      }
    })
  ]
);
```

**Notes:**
- Uses resolver function to extract outlet ID from body
- Body is parsed twice (once in guard, once in handler)
- Consider caching parsed body if performance is critical

---

### Pattern 4: Cross-Company Access (SUPER_ADMIN)

**Use Case:** Routes that allow SUPER_ADMIN to access other companies

**Handler:**
```typescript
export const GET = withAuth(
  async (request, auth) => {
    const url = new URL(request.url);
    const targetCompanyId = Number(url.searchParams.get("company_id") ?? auth.companyId);
    
    // Cross-company check
    if (targetCompanyId !== auth.companyId) {
      const access = await checkUserAccess({
        userId: auth.userId,
        companyId: auth.companyId,
        allowedRoles: ["SUPER_ADMIN"]
      });
      
      if (!access?.isSuperAdmin) {
        return errorResponse("FORBIDDEN", "Forbidden", 403);
      }
    }
    
    const data = await getData(targetCompanyId);
    return successResponse(data);
  },
  [
    requireAccess({
      roles: ["SUPER_ADMIN", "OWNER"],
      module: "companies",
      permission: "read"
    })
  ]
);
```

**Notes:**
- SUPER_ADMIN can access any company
- Non-SUPER_ADMIN restricted to own company
- Check is done in handler (not guard) because guard doesn't have parsed `company_id`

---

## Module Permissions

### Permission Bits

Module permissions are stored as bitwise flags in `module_roles.permission_mask`:

| Permission | Bit | Decimal | Description |
|------------|-----|---------|-------------|
| `create` | 1 << 0 | 1 | Create new resources |
| `read` | 1 << 1 | 2 | View/list resources |
| `update` | 1 << 2 | 4 | Modify existing resources |
| `delete` | 1 << 3 | 8 | Delete resources |

**Combined permissions:**
- Read only: `2`
- Create + Read: `3` (1 | 2)
- Read + Update: `6` (2 | 4)
- Full access: `15` (1 | 2 | 4 | 8)

### Building Permission Masks

```typescript
import { buildPermissionMask } from "../lib/auth";

const mask = buildPermissionMask({
  canCreate: true,
  canRead: true,
  canUpdate: true,
  canDelete: false
});
// Result: 7 (1 + 2 + 4)
```

### Module List

Current modules with permission support:

- `users` - User management
- `outlets` - Outlet management
- `companies` - Company management (SUPER_ADMIN only)
- `settings` - Company/outlet settings
- `accounts` - Chart of accounts
- `journals` - Journal entries
- `sales` - Sales invoices and payments
- `inventory` - Inventory items and prices
- `reports` - Financial and operational reports

### SUPER_ADMIN Bypass

**SUPER_ADMIN always bypasses permission checks** (even without entries in `module_roles`).

```typescript
if (!access.hasPermission && !access.isSuperAdmin) {
  return errorResponse("FORBIDDEN", "No permission", 403);
}
```

---

## Testing Guidelines

### Unit Tests

**Location:** `apps/api/src/lib/auth.test.ts`

**Test Coverage:**
- Global role checks (OWNER, COMPANY_ADMIN)
- Outlet role checks (ADMIN, ACCOUNTANT, CASHIER)
- Outlet role checks without `outletId` (company-wide access)
- Module permission checks (create, read, update, delete)
- SUPER_ADMIN bypass
- Inactive user/deleted company (should return null)

**Example:**
```typescript
test('User with outlet ADMIN role should have hasRole=true', async () => {
  // Setup: Create user with ADMIN in user_role_assignments
  // Assert: checkUserAccess({ allowedRoles: ['ADMIN'] }).hasRole = true
});
```

### Integration Tests

**Location:** `apps/api/tests/integration/outlet-role-acl.integration.test.mjs`

**Test Coverage:**
- Outlet role can access company-wide routes
- Outlet role can access assigned outlet
- Outlet role cannot access non-assigned outlet
- Global role can access all outlets
- SUPER_ADMIN can access other companies
- Permission enforcement (read vs create vs update vs delete)

**Example:**
```javascript
test("outlet role ACL: outlet-scoped roles can access company-wide routes", async () => {
  // Create user with ADMIN at outlet A
  // Request: GET /api/users
  // Assert: 200 OK (not 403)
});
```

---

## Summary

### Key Principles

1. **Use `checkUserAccess` for all authorization checks** (not `userHasAnyRole`)
2. **Global roles access all outlets** within their company
3. **Outlet roles access assigned outlets only**, but can view company-wide data
4. **Permissions control actions**, not visibility (use `module_roles` table)
5. **SUPER_ADMIN bypasses all checks** (cross-company, all permissions)

### Common Pitfalls

❌ **Using `userHasAnyRole` instead of `checkUserAccess`**
- `userHasAnyRole` is deprecated and may produce inconsistent results

❌ **Forgetting to check `hasOutletAccess` for outlet-specific routes**
- Always verify outlet access when route is outlet-scoped

❌ **Not checking SUPER_ADMIN bypass for permissions**
- Always use: `if (!access.hasPermission && !access.isSuperAdmin)`

❌ **Assuming outlet roles cannot access company-wide routes**
- Outlet roles CAN access company-wide routes (permissions control actions)

---

## References

- **Source code:** `apps/api/src/lib/auth.ts` (ACL functions)
- **Route guards:** `apps/api/src/lib/auth-guard.ts` (`requireAccess`, `withAuth`)
- **Database schema:** `packages/db/migrations/0055_roles_scope_levels.sql` (role scopes)
- **Database schema:** `packages/db/migrations/0056_user_outlet_roles.sql` (outlet roles)
- **Integration tests:** `apps/api/tests/integration/outlet-role-acl.integration.test.mjs`

---

**Questions or feedback?** Contact the platform team or open an issue in the repository.
