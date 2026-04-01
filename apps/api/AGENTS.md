# AGENTS.md

## Scope
API server rules for auth, validation, posting triggers, persistence safety, and sync endpoints.

## Sync Contract Canonical Rules (MANDATORY)
- **Request cursor field:** `since_version`
- **Response cursor field:** `data_version`
- Do **NOT** add alias fields (for example `sync_data_version`) in API payloads unless there is an explicit versioned migration plan.
- API sync code must treat `sync_versions` as the only runtime version store.
- API routes/libs must not depend on legacy tables `sync_data_versions` or `sync_tier_versions`.

---

## Review Guidelines

### Priority
- Be strict on correctness, validation, authorization, idempotency, and transaction boundaries.
- Be light on naming or formatting unless it obscures business rules.

### Auth and access control
- Flag routes/mutations not enforcing authentication correctly.
- Flag data access paths not enforcing `company_id` scoping.
- Flag missing `outlet_id` scoping for outlet-specific resources.
- Verify OWNER/ADMIN/ACCOUNTANT/CASHIER boundaries remain enforced.

### Input validation
- Flag missing Zod validation for request bodies, params, query strings, sync payloads, and import payloads.
- Flag permissive parsing that can allow invalid monetary or accounting state.
- Prefer explicit validation errors over silent coercion.

### Accounting and posting
- Verify POSTED/COMPLETED flows cannot bypass required journal creation.
- Flag paths where posting can partially succeed or leave inconsistent batch/line state.
- Verify posting-related writes stay inside one DB transaction when atomicity is required.

### POS sync
- Review `/sync/push` with extra scrutiny.
- Treat duplicate-creation risk around `client_tx_id`, retry handling, resend handling, or race conditions as P1.
- Verify duplicate payloads cannot create duplicate financial effects.
- Verify per-transaction outcomes remain explicit (e.g., `OK`, `DUPLICATE`, `ERROR`).
- Verify sync journal posting mode behavior is intentional and does not silently corrupt accounting state.

### Reports and settings
- Flag report implementations that bypass journals as the financial source of truth.
- Flag settings endpoints allowing unsafe cross-company or cross-outlet access.
- Verify module enablement and tax defaults remain properly scoped.

### Testing expectations
- Expect tests when changing: auth/RBAC, `/sync/push`, `/sync/pull`, posting endpoints, settings/config endpoints, report query logic.

### Database testing policy (MANDATORY)
- **NEVER use mock DB for database-backed business logic tests.**
- Any code path that reads/writes SQL tables (Kysely queries, transactions, posting logic, import validation, sync persistence, auth/role lookups, report queries) must be validated with a **real database**.
- For these paths, prefer integration tests with real DB state over mocked query executors/stubbed SQL results.
- Mocking is acceptable only for pure logic with no database interaction.
- If an existing unit test relies on DB mocks for DB-backed code, migrate it to a real-DB integration test.

---

## Critical Rules

### Unit test database cleanup
- **CRITICAL**: All unit tests using `getDbPool()` **must** close the pool after tests complete.
  ```typescript
  test.after(async () => { await closeDbPool(); });
  ```
- Without this cleanup, tests hang indefinitely.

### Integration test fixture policy
- HTTP integration tests must create/mutate fixtures through API endpoints.
- Direct DB writes are **not allowed** for setup/mutations of business entities.
- Direct DB access is allowed only for:
  1. teardown/cleanup in `finally`
  2. read-only verification when no API endpoint exists (e.g., audit persistence checks)
- All test fixtures should use unique per-run identifiers and deterministic cleanup.

### Audit log status semantics
- `audit_logs.success` is canonical for logic/filtering.
- `audit_logs.result` is compatibility/display only.
- New queries must filter by `success` (`1`/`0`) instead of string `result`.

---

## Library Usage Rules

### Routes: Library-First Architecture
Routes must delegate database operations to library modules.

**Correct:**
```typescript
import { listItems } from "../lib/items.js";
route.get("/", async (c) => {
  const items = await listItems(companyId);
  return c.json({ items });
});
```

**Incorrect:**
```typescript
// ❌ pool.execute() in routes
route.get("/", async (c) => {
  const pool = getDbPool();
  const [rows] = await pool.execute("SELECT * FROM items");
  return c.json({ items: rows });
});
```

**Flag in code review:** `pool.execute()` in route files, SQL strings in routes, routes importing `getDbPool` directly.

### Test Files: Use test-fixtures.ts
Test files must use library functions for test data setup instead of ad-hoc SQL queries.

**Correct:**
```typescript
import { createTestUser, setupUserPermission } from "../test-fixtures";
test("permission check", async () => {
  const user = await createTestUser(company.id);
  await setupUserPermission({ userId: user.id, companyId: company.id, roleCode: "OWNER", module: "inventory", permission: "create" });
  // test assertions...
});
```

**Incorrect:**
```typescript
// ❌ Ad-hoc SQL for test setup
await pool.execute(`INSERT INTO user_role_assignments (user_id, role_id, outlet_id) VALUES (?, ?, NULL)`, [userId, roleId]);
```

**Exception:** Ad-hoc SQL is allowed only for: 1) Teardown/cleanup, 2) Read-only verifications when no library function exists, 3) Schema introspection.

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
| `resetFixtureRegistry()` | Reset registry without deleting records
