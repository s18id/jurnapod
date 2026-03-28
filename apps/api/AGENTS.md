# AGENTS.md

## Scope
API server rules for auth, validation, posting triggers, persistence safety, and sync endpoints.

---

## Review Guidelines

### Priority
- Be strict on correctness, validation, authorization, idempotency, and transaction boundaries.
- Be light on naming or formatting unless it obscures business rules.

### Auth and access control
- Flag any route or mutation that does not enforce authentication correctly.
- Flag any data access path that does not enforce `company_id` scoping.
- Flag missing `outlet_id` scoping where outlet-specific resources are involved.
- Verify OWNER / ADMIN / ACCOUNTANT / CASHIER boundaries remain enforced.

### Input validation
- Flag missing Zod validation for request bodies, params, query strings, sync payloads, and import payloads.
- Flag permissive parsing that can allow invalid monetary or accounting state into the system.
- Prefer explicit validation errors over silent coercion.

### Accounting and posting
- Verify POSTED or COMPLETED flows cannot bypass required journal creation when the feature path expects posting.
- Flag any path where posting can partially succeed or leave inconsistent batch/line state.
- Verify posting-related writes stay inside one DB transaction when business invariants require atomicity.

### POS sync
- Review `/sync/push` with extra scrutiny.
- Treat duplicate-creation risk around `client_tx_id`, retry handling, resend handling, or race conditions as P1.
- Verify duplicate payloads cannot create duplicate financial effects.
- Verify per-transaction outcomes remain explicit, such as `OK`, `DUPLICATE`, or `ERROR`.
- Verify sync journal posting mode behavior is intentional and does not silently corrupt accounting state.

### Reports and settings
- Flag report implementations that bypass journals as the financial source of truth.
- Flag settings endpoints that allow unsafe cross-company or cross-outlet access.
- Verify module enablement and tax defaults remain properly scoped.

### Testing expectations
- Expect tests when changing:
  - auth / RBAC
  - `/sync/push`
  - `/sync/pull`
  - posting endpoints
  - settings/config endpoints
  - report query logic

---

## Critical Rules

### Unit test database cleanup
- **CRITICAL**: All unit tests that use `getDbPool()` **must** close the pool after tests complete.
  ```typescript
  test.after(async () => { await closeDbPool(); });
  ```
- Without this cleanup, tests will hang indefinitely after completion.

### Integration test fixture policy
- HTTP integration tests must create/mutate fixtures through API endpoints.
- Direct DB writes are **not allowed** for setup/mutations of business entities (`users`, `roles`, `outlets`, assignments, etc.).
- Direct DB access is allowed only for:
  1. teardown/cleanup in `finally`,
  2. read-only verification when no API endpoint exists (e.g. audit persistence checks).
- All test fixtures should use unique per-run identifiers and deterministic cleanup.

### Audit log status semantics
- `audit_logs.success` is canonical for logic/filtering.
- `audit_logs.result` is compatibility/display only.
- New queries must filter by `success` (`1` / `0`) instead of string `result`.

---

## Library Usage Rules

### Routes: Library-First Architecture

Routes must delegate database operations to library modules:

**Correct:**
```typescript
// routes/example.ts
import { listItems } from "../lib/items.js";

route.get("/", async (c) => {
  const items = await listItems(companyId);
  return c.json({ items });
});
```

**Incorrect:**
```typescript
// routes/example.ts - ❌ pool.execute() in routes
route.get("/", async (c) => {
  const pool = getDbPool();
  const [rows] = await pool.execute("SELECT * FROM items");
  return c.json({ items: rows });
});
```

**Flag in code review:**
- Any `pool.execute()` in route files
- Any SQL strings in routes
- Routes importing `getDbPool` directly

### Test Files: Use test-fixtures.ts

Test files must use library functions for test data setup instead of ad-hoc SQL queries:

**Correct:**
```typescript
import { createTestUser, setupUserPermission } from "../test-fixtures";

test("permission check", async () => {
  const user = await createTestUser(company.id);
  await setupUserPermission({
    userId: user.id,
    companyId: company.id,
    roleCode: "OWNER",
    module: "inventory",
    permission: "create",
  });
  // test assertions...
});
```

**Incorrect:**
```typescript
// ❌ Ad-hoc SQL for test setup
await pool.execute(
  `INSERT INTO user_role_assignments (user_id, role_id, outlet_id) VALUES (?, ?, NULL)`,
  [userId, roleId]
);
```

**Exception:** Ad-hoc SQL is allowed only for:
1. Teardown/cleanup operations
2. Read-only verifications when no library function exists
3. Schema introspection

---

## test-fixtures.ts Library

**Location**: `apps/api/src/lib/test-fixtures.ts`

| Function | Purpose |
|----------|---------|
| `createTestCompanyMinimal()` | Create company with unique code |
| `createTestOutletMinimal(companyId)` | Create outlet for company |
| `createTestUser(companyId)` | Create user for company |
| `createTestItem(companyId)` | Create item for company |
| `getRoleIdByCode(roleCode)` | Get system role ID ("OWNER", "ADMIN", etc.) |
| `assignUserGlobalRole(userId, roleId)` | Assign global role to user |
| `assignUserOutletRole(userId, roleId, outletId)` | Assign outlet-scoped role |
| `setModulePermission(companyId, roleId, module, mask)` | Set module permission |
| `setupUserPermission({...})` | Complete permission setup in one call |
| `cleanupTestFixtures()` | Clean up all created fixtures |
| `resetFixtureRegistry()` | Reset registry without deleting records |
