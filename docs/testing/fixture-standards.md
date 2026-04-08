# Database Fixture Standards

> **Epic 34 Retrospective Action**: Document canonical fixture patterns to prevent FK constraint violations and sentinel ID anti-patterns in tests.

---

## Core Principle

> **Always use library fixture functions for test setup. Never use ad-hoc SQL INSERTs or hardcoded IDs.**

Test data must satisfy foreign key constraints. Sentinel values like `userId: 0` or `company_id: 1` cause cryptic FK violations when tests run against a real database.

---

## Available Fixtures

### From `apps/api/src/lib/test-fixtures.ts`

| Function | Purpose | Returns |
|----------|---------|---------|
| `createTestCompanyMinimal(opts?)` | Company with unique code | `CompanyFixture` |
| `createTestOutletMinimal(companyId, opts?)` | Outlet for company | `OutletFixture` |
| `createTestUser(companyId, opts?)` | User for company | `UserFixture` |
| `createTestItem(companyId, opts?)` | Item for company | `ItemFixture` |
| `createTestVariant(itemId, opts?)` | Variant for item | `VariantFixture` |
| `getRoleIdByCode(code)` | Role lookup | `number` |
| `assignUserGlobalRole(userId, roleCode)` | Assign global role | `void` |
| `assignUserOutletRole(userId, outletId, roleCode)` | Assign outlet role | `void` |
| `setModulePermission(userId, moduleCode, flags)` | Set module permissions | `void` |
| `setupUserPermission(...)` | Full permission setup | `UserPermissionContext` |
| `cleanupTestFixtures()` | Delete all fixture records | `void` |
| `resetFixtureRegistry()` | Clear in-memory registry | `void` |

### From `packages/db/test/helpers.ts`

| Function | Purpose |
|----------|---------|
| `getTestKysely()` | Create test DB instance |
| `closeTestKysely()` | Close test DB pool |
| `withTestTransaction(fn)` | Run fn in test transaction (auto-rollback) |

---

## FK-Safe Patterns

### ❌ Anti-Pattern: Hardcoded Sentinel IDs

```typescript
// WRONG — violates FK constraints on audit_logs.user_id
const context = {
  userId: 0,  // sentinel value
  companyId: 1,
};

// WRONG — hardcoded ID that may not exist
const item = await db.insertInto('items').values({
  id: 999,
  company_id: 1,
  name: 'Test Item',
}).returningAll();
```

### ✅ Pattern: Use Fixture Functions

```typescript
// CORRECT — fixture generates valid IDs
const company = await createTestCompanyMinimal();
const user = await createTestUser(company.id);
const item = await createTestItem(company.id);

const context = {
  userId: user.id,     // valid FK
  companyId: company.id, // valid FK
};
```

### ✅ Pattern: Create Minimal Data via API

```typescript
// When fixture library doesn't cover the case,
// create data through the API layer (which validates FKs)
const response = await apiClient.post('/items', {
  companyId: company.id,
  name: 'Test Item',
  sku: `TEST-${Date.now()}`,
});
const itemId = response.json().id;
```

---

## Fixture Naming Conventions

| Pattern | Example | Use |
|---------|---------|-----|
| Creator | `createTestCompanyMinimal()` | Returns a full fixture object with `.id` |
| Lookup | `getRoleIdByCode('ADMIN')` | Returns scalar ID |
| Setup | `assignUserGlobalRole(userId, 'ADMIN')` | Attaches existing record to user |
| Cleanup | `resetFixtureRegistry()` | Clears in-memory state |

---

## Cleanup Strategies

### Option 1: `resetFixtureRegistry()` (Default — Most Tests)

Use this for most tests. It clears the in-memory fixture registry but does **not** delete database records.

```typescript
import { resetFixtureRegistry } from '@/lib/test-fixtures';

afterAll(() => {
  resetFixtureRegistry();
  await closeTestDb();
});
```

**When to use**: Tests that create moderate amounts of data, standard route/integration tests.

### Option 2: `cleanupTestFixtures()` (Heavy Data Tests)

Explicitly deletes fixture records from the database. Slower but thorough.

```typescript
import { cleanupTestFixtures } from '@/lib/test-fixtures';

afterAll(async () => {
  await cleanupTestFixtures();
  await closeTestDb();
});
```

**When to use**: Tests that create large datasets, tests with complex FK chains, tests that run in isolation.

### Option 3: Transaction Rollback (Parallel Tests)

Rollback transactions after each test to ensure complete isolation.

```typescript
import { withTestTransaction } from '@jurnapod/db/test/helpers';

it('should create item', async () => {
  await withTestTransaction(async (trx) => {
    const item = await itemService.create({ companyId: 1, name: 'Test' }, { db: trx });
    expect(item.id).toBeDefined();
    // Transaction auto-rollbacks after fn completes
  });
});
```

**When to use**: Tests that must not interfere with each other, parallel test execution.

---

## Common FK Relationships

Understanding these FK chains helps you create valid test data:

```
companies
  └── outlets (outlet.company_id → companies.id)
        └── users (user.outlet_id → outlets.id)
              └── audit_logs (audit_logs.user_id → users.id)

items
  └── item_variants (variant.item_id → items.id)

accounts (company-scoped, no outlet FK)
  └── journal_entries (entry.account_id → accounts.id)
```

---

## Fixture Creation Order

When you need a complete dependency chain:

```typescript
// 1. Create company first (root of most FK trees)
const company = await createTestCompanyMinimal();

// 2. Create outlet (depends on company)
const outlet = await createTestOutletMinimal(company.id);

// 3. Create user (depends on outlet)
const user = await createTestUser(company.id);

// 4. Assign role (depends on user + role lookup)
await assignUserGlobalRole(user.id, 'ADMIN');

// 5. Create items (depends on company)
const item = await createTestItem(company.id);

// 6. Create variants (depends on item)
const variant = await createTestVariant(item.id);

// Now you have a valid FK tree for business logic tests
const context = {
  userId: user.id,
  companyId: company.id,
  outletId: outlet.id,
};
```

---

## When No Fixture Exists

If you need test data that the fixture library doesn't cover:

1. **Check if the API creates it** — Use the API endpoint instead of direct DB insert
2. **Extend the fixture library** — Add a new fixture function to `apps/api/src/lib/test-fixtures.ts`
3. **Use `withTestTransaction`** — Create data inside a transaction that auto-rollbacks

**Never** insert directly via `db.insertInto()` unless you're intentionally testing raw SQL behavior.

---

## Troubleshooting FK Violations

### Error: `FOREIGN KEY constraint failed`

**Cause**: Inserting a record with a non-existent FK value.

**Fix**: Ensure parent records exist before inserting children. Use fixture functions.

### Error: `UNIQUE constraint failed`

**Cause**: Reusing a unique identifier (e.g., `client_tx_id`).

**Fix**: Use `Date.now()` or `crypto.randomUUID()` for unique values in tests.

### Error: `NOT NULL constraint failed`

**Cause**: Omitting a required FK column.

**Fix**: Ensure all non-nullable columns are set, including FKs.

---

## References

- [Canonical Test Directory Structure](https://github.com/jurnapod/jurnapod/blob/main/AGENTS.md#canonical-test-directory-structure)
- [DB Cleanup Hook Patterns](./cleanup-patterns.md)
- [Pre-Reorganization Tool Standardization Checklist](../process/tool-standardization-checklist.md)
