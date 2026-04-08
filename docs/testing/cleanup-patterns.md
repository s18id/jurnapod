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

## References

- [Canonical Test Directory Structure](https://github.com/jurnapod/jurnapod/blob/main/AGENTS.md#canonical-test-directory-structure)
- [Database Fixture Standards](./fixture-standards.md)
- [Pre-Reorganization Tool Standardization Checklist](../process/tool-standardization-checklist.md)
