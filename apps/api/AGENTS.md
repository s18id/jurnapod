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

## Test Standards

### Test Configuration
| Aspect | Standard |
|--------|----------|
| Framework | Vitest |
| File extension | `.ts` only |
| Location | `apps/api/__test__/` |
| Environment | Single process (no spawned workers) |
| Env loading | Root `.env` + package override |

### Test Types

#### Unit Tests
- **No database** - Pure functions only
- **Fast execution** - Complete in milliseconds
- **Location:** `__test__/unit/{module}/`
- **File naming:** `{feature}.{subfeature}.test.ts` (e.g., `items.prices.test.ts`)

**Example unit test:**
```typescript
import { describe, it, expect } from 'vitest';
import { parsePagination } from '@/lib/pagination';

describe('pagination.parse', () => {
  it('caps limit at MAX_PAGE_SIZE', () => {
    const result = parsePagination({ limit: '500' });
    expect(result.limit).toBe(200);
  });
});
```

#### Integration Tests
- **Real database** via `getDb()` from `lib/db.ts`
- **In-process HTTP server** via shared test server
- **Location:** `__test__/integration/{module}/`
- **File naming:** Same pattern as unit tests

**Example integration test:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { acquireReadLock, releaseReadLock } from '../helpers/setup';
import { getTestDb, closeTestDb } from '../helpers/db';
import { createTestCompany, cleanupTestFixtures } from '../fixtures';

describe('items.crud', () => {
  beforeAll(async () => { await acquireReadLock(); });
  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
    await releaseReadLock();
  });

  it('creates item', async () => {
    const company = await createTestCompany();
    const db = getTestDb();
    // ... test
  });
});
```

### RWLock Server Pattern (MANDATORY)
Integration tests sharing the HTTP server MUST use the RWLock pattern:
```typescript
// Each test file acquires a read lock
beforeAll(async () => { await acquireReadLock(); });
afterAll(async () => { await releaseReadLock(); });

// DB cleanup via closeTestDb()
afterAll(async () => { await closeTestDb(); });
```
The server starts on first lock acquisition and stops when all locks are released.

### Database Testing Policy (MANDATORY)
- **NEVER use mock DB for database-backed business logic tests.**
- Any code path that reads/writes SQL tables (Kysely queries, transactions, posting logic, import validation, sync persistence, auth/role lookups, report queries) must be validated with a **real database**.
- Mocking is acceptable only for pure logic with no database interaction.

### Fixture Policy
- Use `createTestCompany()`, `createTestOutlet()`, `createTestUser()` from `__test__/fixtures`
- Direct DB writes are **not allowed** for test data setup
- Exception: Teardown/cleanup, read-only verification

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

---

## Critical Rules

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

### Test Files: Use test-fixtures
Test files must use library functions for test data setup instead of ad-hoc SQL queries.

**Correct:**
```typescript
import { createTestUser, setupUserPermission } from "../fixtures";
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

## Test Infrastructure

### Helper Files
| File | Purpose |
|------|---------|
| `__test__/helpers/setup.ts` | RWLock server management, `acquireReadLock()`, `releaseReadLock()` |
| `__test__/helpers/db.ts` | DB access via `getTestDb()`, `closeTestDb()` |
| `__test__/helpers/env.ts` | Test environment utilities |
| `__test__/fixtures/index.ts` | Re-exports from `src/lib/test-fixtures.ts` |

### test-fixtures.ts Library
**Location**: `apps/api/src/lib/test-fixtures.ts`

| Function | Purpose |
|----------|---------|
| `createTestCompany()` | Create company with unique code |
| `createTestOutlet(companyId)` | Create outlet for company |
| `createTestUser(companyId)` | Create user for company |
| `createTestItem(companyId)` | Create item for company |
| `createTestVariant(itemId)` | Create variant for item |
| `getRoleIdByCode(roleCode)` | Get system role ID ("OWNER", "ADMIN", etc.) |
| `assignUserGlobalRole(userId, roleId)` | Assign global role to user |
| `assignUserOutletRole(userId, roleId, outletId)` | Assign outlet-scoped role |
| `setModulePermission(companyId, roleId, module, mask)` | Set module permission |
| `setupUserPermission({...})` | Complete permission setup in one call |
| `cleanupTestFixtures()` | Clean up all created fixtures |
| `resetFixtureRegistry()` | Reset registry without deleting records |

### Test File Structure
```
__test__/
├── unit/
│   ├── pagination/
│   │   ├── parse.test.ts
│   │   └── build.test.ts
│   ├── common-utils/
│   │   ├── money.test.ts
│   │   └── format.test.ts
│   └── sync/
│       └── types.test.ts
├── integration/
│   ├── auth/
│   │   └── login.test.ts
│   ├── items/
│   │   ├── crud.test.ts
│   │   └── prices.test.ts
│   └── sync/
│       └── push.test.ts
├── helpers/
│   ├── setup.ts
│   ├── db.ts
│   └── env.ts
└── fixtures/
    └── index.ts
```
