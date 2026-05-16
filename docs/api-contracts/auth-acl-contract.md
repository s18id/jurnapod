# Auth and ACL Contract

**Applies to:** All stable API endpoints  
**Stability:** `stable`  
**Owner:** API/Auth, API/Platform  
**CI gate:** `lint:api-contracts` (via `scripts/check-api-contract-diff.ts`)

---

## Auth Model

### Token Format

| Field | Value |
|-------|-------|
| Type | JWT (HS256) |
| Header field | `Authorization: Bearer <token>` |
| Expiry | Configurable; default 15 minutes |
| Refresh | Via `POST /api/auth/refresh` with httpOnly cookie |

### Auth Middleware Behavior

Every protected endpoint MUST:

1. Extract `Authorization` header from the request.
2. Validate the JWT signature against the server's secret.
3. Check token expiry (`exp` claim).
4. Extract `company_id`, `user_id`, and `role_id` from the token payload.
5. Reject requests with missing, malformed, or expired tokens using `401 UNAUTHORIZED`.

### Auth Error Responses

All auth failures return a consistent error envelope:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid access token"
  }
}
```

Error codes:

| Code | Trigger |
|------|---------|
| `UNAUTHORIZED` | Missing `Authorization` header |
| `UNAUTHORIZED` | Malformed JWT (cannot be parsed) |
| `UNAUTHORIZED` | Expired token |
| `UNAUTHORIZED` | Invalid signature |

---

## Role Model

### System Roles (immutable reference data)

| Role | `role_id` | Permissions |
|------|-----------|-------------|
| `SUPER_ADMIN` | Seeded, `company_id = NULL` | Full CRUDAM on all modules |
| `OWNER` | Seeded, `company_id = NULL` | Full CRUDAM on all modules |
| `COMPANY_ADMIN` | Seeded, `company_id = NULL` | CRUDA on platform; CRUDAM on accounting, inventory, treasury, sales, pos, purchasing, reservations |
| `ADMIN` | Seeded, `company_id = NULL` | READ on platform; CRUDA on accounting, inventory, treasury, sales, pos, purchasing, reservations |
| `ACCOUNTANT` | Seeded, `company_id = NULL` | READ on platform, accounting, inventory, treasury, sales, pos; CRUDA on purchasing |
| `CASHIER` | Seeded, `company_id = NULL` | READ on inventory, treasury, sales, pos; CRUDA on sales, pos, reservations |

System roles MUST NOT be mutated in tests or application code. See `AGENTS.md` ACL Cleanup Policy.

### Role Assignment

- Roles are assigned to users via `user_role_assignments` table.
- Global roles (`outlet_id IS NULL`) apply to all outlets in the company.
- Outlet-scoped roles apply only to the specified outlet.

---

## Module Permission Model

### 8 Canonical Modules

| Module | Description |
|--------|-------------|
| `platform` | Users, roles, companies, outlets, settings |
| `pos` | Point of sale transactions and configuration |
| `sales` | Invoices, orders, payments, credit notes |
| `inventory` | Items, stock, supplies, recipes |
| `accounting` | Journals, accounts, fiscal years, reports |
| `treasury` | Cash/bank transactions |
| `purchasing` | Suppliers, purchase orders, goods receipts, invoices, payments, credits |
| `reservations` | Bookings, tables, dine-in sessions |

### Permission Bits

| Bit | Name | Value | Purpose |
|-----|------|-------|---------|
| 1 | READ | 1 | View data and records |
| 2 | CREATE | 2 | Create new records |
| 4 | UPDATE | 4 | Modify existing records |
| 8 | DELETE | 8 | Remove records (soft-delete via VOID for financial docs) |
| 16 | ANALYZE | 16 | Reports, dashboards, analytics |
| 32 | MANAGE | 32 | Setup, configuration, administration |

### Permission Masks

| Mask | Value | Binary | Permissions |
|------|-------|--------|-------------|
| READ | 1 | `0b000001` | View only |
| WRITE | 6 | `0b000110` | CREATE + UPDATE |
| CRUD | 15 | `0b001111` | READ + CREATE + UPDATE + DELETE |
| CRUDA | 31 | `0b011111` | CRUD + ANALYZE |
| CRUDAM | 63 | `0b111111` | Full permissions |

### Resource-Level ACL Format

Permissions use `module.resource` format:

```
platform.users          → platform module, users resource
sales.invoices          → sales module, invoices resource
purchasing.suppliers    → purchasing module, suppliers resource
accounting.journals     → accounting module, journals resource
```

`requireAccess()` calls MUST include the `resource` parameter:

```typescript
// ✅ Correct — explicit resource
await requireAccess({ module: "inventory", resource: "items", permission: "read" })(request, auth);

// ❌ Invalid — missing resource (will fail at runtime)
await requireAccess({ module: "inventory", permission: "read" })(request, auth);
```

---

## Company Scoping

### Rules

1. All data queries MUST include `company_id` filter from the authenticated user's token.
2. Cross-company data access is forbidden and MUST return `403 FORBIDDEN`.
3. `company_id` from token payload takes precedence over any `company_id` in request body.
4. Responses MUST NOT leak entity metadata for resources that exist but are not accessible to the user (use `NOT_FOUND` instead of `FORBIDDEN` for non-existence ambiguity).

### Enforcement Checklist

- [ ] All stable routes enforce `company_id` scoping.
- [ ] Cross-company queries return `403` or safe `404`.
- [ ] `company_id` in request body is ignored and overwritten from token.

---

## Outlet Scoping

### Rules

1. Outlet-scoped resources (POS transactions, dine-in sessions, stock) require the user to have access to the requested `outlet_id`.
2. User's outlet access is checked via `user_role_assignments.outlet_id` or global role.
3. Missing outlet access MUST return `403 FORBIDDEN`.
4. Outlet ID in request parameters is validated against the user's access.

### Enforcement Checklist

- [ ] All outlet-scoped routes validate outlet access.
- [ ] Users without outlet access receive `403 FORBIDDEN`.
- [ ] `outlet_id` in request body/params is validated against auth context.

---

## Negative Test Requirements

For every stable endpoint group, the following cases MUST be tested:

| Test | Expected Status |
|------|----------------|
| Missing token returns `401` | `UNAUTHORIZED` |
| Invalid token returns `401` | `UNAUTHORIZED` |
| Expired token returns `401` | `UNAUTHORIZED` |
| Wrong company returns `403` or safe `404` | `FORBIDDEN` |
| Wrong outlet returns `403` | `FORBIDDEN` |
| Insufficient role returns `403` | `FORBIDDEN` |
| Deactivated user returns `401` | `UNAUTHORIZED` |

### Invalid Test Role Rule

Negative authorization tests (expecting `401`/`403`) MUST NOT use roles that legitimately have access (e.g., `OWNER`, `SUPER_ADMIN`, `COMPANY_ADMIN`).

Valid test roles for negative tests:
- `CASHIER` — lowest privilege role for operational workflows
- Custom test role with explicit missing permissions

---

## Error Codes (Auth / ACL)

| Code | Status | Meaning |
|------|--------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid auth token |
| `FORBIDDEN` | 403 | Authenticated but not allowed (role, outlet, company) |
| `NOT_FOUND` | 404 | Resource not found or safely hidden |

### Security / Non-Leakage Rules

1. `FORBIDDEN` responses MUST NOT indicate whether the resource exists.
2. `NOT_FOUND` responses MUST NOT indicate whether the resource exists in another company.
3. Entity existence leaks in 404 responses are treated as P0 security vulnerabilities.
4. Stack traces and internal error details MUST NOT appear in responses.
5. Error responses for auth failures MUST NOT reveal why the token is invalid (e.g., do not say "token expired" vs "token malformed").

---

## Breaking Change Policy

The following changes to `stable` auth/ACL behavior require a version bump:

| Change | Breaking? |
|--------|-----------|
| Change auth header extraction behavior | Yes |
| Change token format or signing algorithm | Yes |
| Change permission bit values | Yes |
| Change module/resource naming | Yes |
| Change `company_id` scoping behavior | Yes |
| Change outlet access checking behavior | Yes |
| Remove role permission | Yes |
| Add new system role | Maybe (document migration) |

---

## OpenAPI Security Registration

All stable endpoints MUST document their security requirements in OpenAPI using `security: [{ BearerAuth: [] }]` or `security: []` for public endpoints.

Current baseline registration: `docs/api-contracts/openapi-0.3-stability-baseline.json`

Baseline version: `0.3-stability-baseline`