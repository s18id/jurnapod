# Database Cleanup Hook Patterns

> **Epic 34 Retrospective Action**: Document correct `afterAll`/`afterEach` patterns to prevent shared-pool destruction failures and test hangs.

---

## Core Problem

During Epic 34, `afterEach` was used to destroy a shared database pool, causing all subsequent tests in the suite to fail. The fix: use `afterAll` for pool cleanup, not `afterEach`.

---

## Integration Test Patterns

### API Integration Tests (`apps/api/__test__/integration/`)

**Standard pattern** — most tests:

```typescript
import { resetFixtureRegistry } from '@/lib/test-fixtures';
import { closeTestDb } from '@/helpers/db';

afterAll(async () => {
  resetFixtureRegistry();
  await closeTestDb();
});
```

**When fixtures create heavy data** (large datasets, complex FK trees):

```typescript
import { cleanupTestFixtures } from '@/lib/test-fixtures';
import { closeTestDb } from '@/helpers/db';

afterAll(async () => {
  await cleanupTestFixtures();  // Explicitly delete fixture records
  await closeTestDb();
});
```

### DB Transaction Isolation (Parallel-Safe Tests)

For tests that must not interfere with each other:

```typescript
import { withTestTransaction } from '@jurnapod/db/test/helpers';

describe('OrderService', () => {
  it('should create order with valid FKs', async () => {
    await withTestTransaction(async (trx) => {
      // All operations use the test transaction
      const order = await orderService.create({ companyId: 1, ... }, { db: trx });
      expect(order.id).toBeDefined();
      // Transaction auto-rollbacks after this fn completes
    });
  });
});
```

**Note**: When using `withTestTransaction`, you typically don't need `cleanupTestFixtures()` because the transaction rollback handles isolation.

---

## Package Test Patterns

### With Kysely (`packages/*/__test__/`)

```typescript
import { getTestKysely, closeTestKysely } from '@jurnapod/db/test/helpers';

describe('SomeService', () => {
  const db = getTestKysely();

  afterAll(async () => {
    await closeTestKysely(db);
  });
});
```

### Pure Unit Tests (No DB)

```typescript
// No cleanup needed — pure functions only
describe('dateUtils', () => {
  it('should parse ISO date', () => {
    expect(parseDate('2024-01-01')).toBeInstanceOf(Date);
  });
});
```

---

## Cleanup Timing Rules

| Hook | Use Case | ❌ Wrong | ✅ Correct |
|------|----------|---------|-----------|
| `afterAll` | Shared pool cleanup | `afterEach(() => db.destroy())` | `afterAll(async () => { db.destroy() })` |
| `afterEach` | Reset test state (not pool) | `afterEach(() => resetState())` | `afterEach(async () => { await cleanupTable() })` |
| `beforeAll` | Setup once for all tests | — | `beforeAll(async () => { db = getTestKysely() })` |
| `beforeEach` | Fresh state per test | — | `beforeEach(async () => { await db.deleteFrom('table').execute() })` |

### Critical Rule: Never Destroy Pool in `afterEach`

```typescript
// ❌ WRONG — destroys shared pool after EACH test
afterEach(async () => {
  await db.destroy();  // Test 1 passes, Tests 2-N fail with "Connection closed"
});

// ✅ CORRECT — destroy pool once after ALL tests
afterAll(async () => {
  await db.destroy();
});
```

---

## Idempotency Test Cleanup

Idempotency tests create records with specific keys. Clean up between tests to avoid key collisions:

```typescript
afterEach(async () => {
  // Clean up idempotency records by key pattern
  await db
    .deleteFrom('fiscal_year_close_requests')
    .where('close_request_id', 'like', `test-${Date.now()}%`)
    .execute();
});
```

---

## Fixture Registry Cleanup

The fixture registry (`resetFixtureRegistry()`) tracks created fixtures in memory. It does **not** delete database records.

```typescript
// What resetFixtureRegistry does:
const registry = { companies: [], users: [], items: [] };
function resetFixtureRegistry() {
  registry.companies = [];
  registry.users = [];
  registry.items = [];
}
// Does NOT: DELETE FROM companies WHERE ...

// What cleanupTestFixtures does:
async function cleanupTestFixtures() {
  await db.deleteFrom('items').where('id', 'in', registry.items).execute();
  await db.deleteFrom('users').where('id', 'in', registry.users).execute();
  await db.deleteFrom('companies').where('id', 'in', registry.companies).execute();
}
```

---

## Test Isolation Best Practices

### Use Unique Names/Keys Per Test

```typescript
it('should create item with unique SKU', async () => {
  const sku = `TEST-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const item = await createItem({ sku });
  expect(item.sku).toBe(sku);
});
```

### Clean Tables That Persist Across Tests

```typescript
beforeEach(async () => {
  // Truncate before each test for guaranteed isolation
  await db.deleteFrom('orders').execute();
});

afterAll(async () => {
  await db.destroy();
});
```

### Avoid Global Mutable State

```typescript
// ❌ WRONG — shared state across tests
let sharedDb;
beforeAll(() => { sharedDb = getTestKysely(); });
it('modifies state', () => { /* changes sharedDb */ });
it('reads state', () => { /* sees modified state */ });

// ✅ CORRECT — each test is independent
it('creates order', async () => {
  const db = getTestKysely();
  const order = await createOrder({ db });
  expect(order.id).toBeDefined();
  await db.destroy();
});
```

---

## Preventing Test Hangs

Tests hang when:
1. Database pool is not closed (`db.destroy()` missing in `afterAll`)
2. Unresolved promises (missing `await` or `.then()`)
3. Infinite loops in test code

**Debug hanging tests:**

```typescript
// Add timeout to detect hangs
it('should complete within 5s', async () => {
  const result = await Promise.race([
    doSomething(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
  ]);
  expect(result).toBeDefined();
}, 5000); // 5s timeout for this test
```

---

## Common Patterns Quick Reference

```typescript
// PATTERN 1: Standard API integration test
afterAll(async () => {
  resetFixtureRegistry();
  await closeTestDb();
});

// PATTERN 2: Heavy data API test
afterAll(async () => {
  await cleanupTestFixtures();
  await closeTestDb();
});

// PATTERN 3: Package test with Kysely
afterAll(async () => {
  await db.destroy();
});

// PATTERN 4: Transaction-isolated test
it('test', async () => {
  await withTestTransaction(async (trx) => {
    // auto-rollback
  });
});

// PATTERN 5: Table cleanup per test
beforeEach(async () => {
  await db.deleteFrom('orders').execute();
});
```

---

---

## beforeAll with Cached Seed Context Pattern

When using `getSeedSyncContext()` in integration tests, always cache it in `beforeAll` to eliminate async call overhead in `it()` blocks:

```typescript
// 1. Import with alias — the actual async load function
import { getSeedSyncContext as loadSeedSyncContext } from '../../../fixtures';

// 2. Suite-level variable to hold the cached context
let seedCtx: Awaited<ReturnType<typeof loadSeedSyncContext>>;

// 3. Zero-overhead wrapper — just returns the cached value
const getSeedSyncContext = async () => seedCtx;

// 4. In beforeAll — call the load function ONCE
beforeAll(async () => {
  seedCtx = await loadSeedSyncContext();
});

// 5. In it() blocks — use the wrapper (no async overhead)
it('some test', async () => {
  const ctx = await getSeedSyncContext();  // ← synchronous return
  // use ctx.companyId, ctx.outletId, etc.
});

afterAll(async () => {
  resetFixtureRegistry();
  await closeTestDb();
});
```

**Why two functions?**
- `loadSeedSyncContext()` — the actual async function that queries DB if not cached. Called once in `beforeAll`.
- `getSeedSyncContext()` — the zero-overhead wrapper that just returns the cached `seedCtx` value. Called in every `it()` block.

**Rules:**
- Never call `loadSeedSyncContext()` inside an `it()` block — always use the wrapper
- Always set deterministic passwords (`process.env.JP_OWNER_PASSWORD`) on login-capable test users
- Use `resetFixtureRegistry()` in `afterAll()` to clean up

---

## Try/Finally for Mid-Execution Failure Cleanup

When a test fails mid-execution, cleanup in `finally` ensures resources are released regardless of success or failure:

```typescript
describe('OrderService', () => {
  let db: TestDb;
  let companyId: number;

  beforeAll(async () => {
    db = await getTestDb();
    const company = await createTestCompany();
    companyId = company.id;
  });

  afterAll(async () => {
    await cleanupTestFixtures();
    await closeTestDb();
  });

  it('should create order', async () => {
    let order;
    try {
      order = await orderService.create({
        companyId,
        items: [{ sku: 'TEST-001', quantity: 1 }]
      });
      expect(order.id).toBeDefined();
    } finally {
      // Cleanup even if test fails
      if (order?.id) {
        await db.deleteFrom('orders').where('id', '=', order.id).execute();
      }
    }
  });

  it('should process payment', async () => {
    // Test code...
  });
});
```

**Key principle:** Use `finally` for cleanup that must run regardless of test outcome. This prevents resource leaks when assertions fail.

---

## Tenant Isolation Cleanup Rules

All cleanup DELETE statements **MUST** scope by `company_id` and `outlet_id` to prevent cross-tenant data pollution:

```typescript
// ❌ WRONG — deletes across all tenants
await db.deleteFrom('items').where('id', '=', itemId).execute();

// ✅ CORRECT — scopes to specific tenant
await db
  .deleteFrom('items')
  .where('company_id', '=', companyId)
  .where('id', '=', itemId)
  .execute();
```

### Multi-Tenant Cleanup Pattern

```typescript
afterAll(async () => {
  // Clean up in correct order respecting foreign keys
  await db.deleteFrom('inventory_transactions')
    .where('company_id', '=', companyId)
    .where('outlet_id', '=', outletId)
    .execute();

  await db.deleteFrom('stock')
    .where('company_id', '=', companyId)
    .where('outlet_id', '=', outletId)
    .execute();

  await db.deleteFrom('items')
    .where('company_id', '=', companyId)
    .execute();

  await db.deleteFrom('outlets')
    .where('company_id', '=', companyId)
    .execute();

  await db.updateTable('companies')
    .set({ deleted_at: new Date() })
    .where('id', '=', companyId)
    .execute();
});
```

**Rule:** Always include `company_id` in WHERE clauses. Add `outlet_id` when the resource is outlet-scoped.

---

## ACL Cleanup P0 Rule

**CRITICAL — P0 Blocker:** Canonical system roles are immutable reference data in persistent test DBs. Deleting or modifying `module_roles` rows for system roles (`SUPER_ADMIN`, `OWNER`, `COMPANY_ADMIN`, `ADMIN`, `ACCOUNTANT`, `CASHIER`) with `company_id=NULL` corrupts the seeded ACL baseline and breaks all subsequent tests.

### P0 Rules for ACL Cleanup

- ❌ **BLOCKER**: Any cleanup/deletion by `role_id` alone on `module_roles` — this wipes canonical rows shared across all companies
- ✅ **Required**: ACL cleanup must scope by `company_id` AND `role_id`: `WHERE company_id = ? AND role_id IN (?)`
- ✅ **Required**: Integration tests should mutate **custom test roles**, not seeded system roles
- ✅ **Required**: Use exact inserted row IDs when cleanup scope is ambiguous

### Correct ACL Cleanup

```typescript
// ❌ WRONG — deletes ACL for role_id across ALL companies
await db.deleteFrom('module_roles')
  .where('role_id', '=', roleId)
  .execute();

// ✅ CORRECT — deletes ACL only for specific company+role
await db.deleteFrom('module_roles')
  .where('company_id', '=', companyId)
  .where('role_id', '=', roleId)
  .execute();
```

### For Custom Test Roles Only

```typescript
// Create a custom test role for ACL mutation tests
it('should test custom ACL', async () => {
  const testRole = await createTestRole(baseUrl, accessToken, 'CustomACLTest');
  
  try {
    await setModulePermission(companyId, testRole.id, 'inventory', 'items', 15);
    // ... test code
  } finally {
    // Cleanup custom role only — does not affect system roles
    await db.deleteFrom('module_roles')
      .where('company_id', '=', companyId)
      .where('role_id', '=', testRole.id)
      .execute();
    
    await db.deleteFrom('roles')
      .where('id', '=', testRole.id)
      .where('company_id', '=', companyId)  // Custom roles have company_id
      .execute();
  }
});
```

**Recovery for corrupted ACL:**
```bash
npm run db:migrate -w @jurnapod/db
npm run db:seed -w @jurnapod/db
npm run db:seed:test-accounts -w @jurnapod/db
```

---

## Anti-Pattern Examples

### Anti-Pattern 1: Destroying Pool in afterEach

```typescript
// ❌ WRONG — destroys shared pool after EACH test
afterEach(async () => {
  await db.destroy();  // Test 1 passes, Tests 2-N fail with "Connection closed"
});

// Symptoms: Tests 2-N fail with errors like:
// - "Error: Connection closed"
// - "Error: Cannot query after connection pool closed"
// - Sporadic timeouts

// ✅ CORRECT — destroy pool once after ALL tests
afterAll(async () => {
  await db.destroy();
});
```

### Anti-Pattern 2: Missing Pool Cleanup (Causes Test Hangs)

```typescript
// ❌ WRONG — no pool cleanup, tests hang indefinitely
describe('MyTests', () => {
  it('test 1', async () => { /* ... */ });
  it('test 2', async () => { /* ... */ });
  // No afterAll — process never exits
});

// ✅ CORRECT — cleanup in afterAll
describe('MyTests', () => {
  afterAll(async () => {
    resetFixtureRegistry();
    await closeTestDb();  // Closes pool, allows process to exit
  });
  
  it('test 1', async () => { /* ... */ });
  it('test 2', async () => { /* ... */ });
});
```

### Anti-Pattern 3: ACL Cleanup Without company_id (Corrupts System Roles)

```typescript
// ❌ WRONG — deletes module_roles for role_id across ALL companies
// This corrupts canonical system role permissions!
await db.deleteFrom('module_roles')
  .where('role_id', '=', roleId)
  .execute();

// Symptoms after running tests:
// - SUPER_ADMIN can no longer access platform.users
// - OWNER cannot manage outlets
// - CASHIER permissions reset unexpectedly
// - Other tests fail with unexpected 403 errors

// ✅ CORRECT — scope to specific company+role
await db.deleteFrom('module_roles')
  .where('company_id', '=', companyId)
  .where('role_id', '=', roleId)
  .execute();
```

### Anti-Pattern 4: Missing Tenant Isolation in Cleanup

```typescript
// ❌ WRONG — deletes items without tenant scoping
await db.deleteFrom('items').execute();  // DELETES ALL ITEMS FROM ALL COMPANIES!

// ✅ CORRECT — scope to tenant
await db.deleteFrom('items')
  .where('company_id', '=', companyId)
  .execute();
```

### Anti-Pattern 5: Not Using try/finally for Resource Cleanup

```typescript
// ❌ WRONG — no cleanup if assertion fails
it('should create resource', async () => {
  const resource = await createExpensiveResource();
  expect(resource.status).toBe('active');  // If this fails...
  // ... resource is never cleaned up
});

// ✅ CORRECT — cleanup in finally
it('should create resource', async () => {
  let resource;
  try {
    resource = await createExpensiveResource();
    expect(resource.status).toBe('active');
  } finally {
    if (resource?.id) {
      await deleteResource(resource.id);
    }
  }
});
```

---

## References

- [Canonical Test Directory Structure](https://github.com/jurnapod/jurnapod/blob/main/AGENTS.md#canonical-test-directory-structure)
- [Database Fixture Standards](./fixture-standards.md)
- [Pre-Reorganization Tool Standardization Checklist](../process/tool-standardization-checklist.md)
- [test-fixtures.ts Library Functions](../api/src/lib/test-fixtures.ts)
