# Database Fixture Standards

> **Epic 34 Retrospective Action**: Document canonical fixture patterns to prevent FK constraint violations and sentinel ID anti-patterns in tests.

> **Owner-Package Model (Sprint 48-61):** Domain fixtures MUST live in their owner packages (`packages/modules-accounting`, `packages/modules-platform`, `packages/modules-purchasing`, etc.). `@jurnapod/db/test-fixtures` is **DB-generic primitives/assertions only** — constants, enums, typed helper interfaces with no domain semantics. `apps/api/src/lib/test-fixtures.ts` is a **transitional re-export layer** for existing consumers during migration.

---

## Core Principle

> **Always use library fixture functions for test setup. Never use ad-hoc SQL INSERTs or hardcoded IDs.**

Test data must satisfy foreign key constraints. Sentinel values like `userId: 0` or `company_id: 1` cause cryptic FK violations when tests run against a real database.

---

## Fixture Ownership Model

| Layer | Location | What It Contains | What It MUST NOT Contain |
|-------|----------|-----------------|------------------------|
| **DB-generic primitives** | `@jurnapod/db/test-fixtures` | Constants, enums, typed helper interfaces, assertion utilities with no domain semantics | Domain business logic, entity creation helpers |
| **Domain fixtures** | `packages/modules-{domain}/src/test-fixtures/` | Entity creators (`createTest*`) and seed helpers owned by the domain package | Infrastructure-only concerns |
| **Transitional re-export** | `apps/api/src/lib/test-fixtures.ts` | Thin re-exports from owner packages during migration | New domain-invariant logic |

**Rule:** When a canonical fixture function exists in an owner package, tests MUST use the owner-package function. `@jurnapod/db/test-fixtures` is not the canonical home for domain fixtures.

## Transitional API-Runtime Re-export

`apps/api/src/lib/test-fixtures.ts` is a **thin re-export layer** that delegates to owner-package fixtures during migration. It MUST NOT contain new domain-invariant logic.

### How the Wrapper Works

```typescript
// Thin re-export layer — delegates to owner packages and legacy helpers
// apps/api/src/lib/test-fixtures.ts

export { createTestCompanyMinimal } from '@jurnapod/modules-platform/test-fixtures';
// ... other re-exports from owner packages

// Legacy helpers that predate owner-package model remain here during migration
// but new domain fixtures belong in owner packages, not here
```

### Two Cleanup Strategies

| Strategy | Function | Behavior | Use Case |
|----------|----------|----------|----------|
| Option 1 (Default) | `resetFixtureRegistry()` | Clears in-memory registry only. Records remain in DB. | Most integration tests |
| Option 2 (Opt-in) | `cleanupTestFixtures()` | Deletes all tracked records from DB. Slower but thorough. | Heavy data, isolated tests |

**Hybrid Cleanup Policy** (Default: Option 1):
- Tests create unique data per run using timestamp-based codes
- Records are NOT deleted — let cascade handle cleanup naturally
- `afterAll` calls `resetFixtureRegistry()` to clear the in-memory registry
- Avoids FK constraint issues from premature deletion order

---

## Lifecycle Rules

### Standard Integration Test Lifecycle

```typescript
import { createTestCompanyMinimal, resetFixtureRegistry } from '@/lib/test-fixtures';
import { closeTestDb } from '../helpers/db';

describe('items.crud', () => {
  beforeAll(async () => { /* test setup */ });
  afterAll(async () => {
    resetFixtureRegistry();   // 1. Reset registry (not destructive)
    await closeTestDb();      // 2. Close DB pool (mandatory!)
  });

  it('creates item', async () => {
    const company = await createTestCompanyMinimal();
    // ... test code
  });
});
```

**Mandatory Hook Order:**
1. `afterAll` must call `resetFixtureRegistry()` (or `cleanupTestFixtures()`)
2. `afterAll` must call `closeTestDb()` to release pool connections

**Why pool cleanup is mandatory:** Tests hang indefinitely without closing the DB pool. This is non-negotiable.

---

## The `beforeAll` + `getSeedSyncContext()` Pattern

When tests need seeded sync context (company/outlet/cashier from environment), use the **cached wrapper pattern** to eliminate async call overhead in `it()` blocks:

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
it('some sync test', async () => {
  const ctx = await getSeedSyncContext();  // ← synchronous return from cache
  // use ctx.companyId, ctx.outletId, ctx.cashierUserId
});
```

**Why two functions?**
- `loadSeedSyncContext()` — the actual async function that queries DB if not cached. Called **once** in `beforeAll`.
- `getSeedSyncContext()` — the zero-overhead wrapper that just returns the cached `seedCtx` value. Called in every `it()` block.

**Rules:**
- Never call `loadSeedSyncContext()` inside an `it()` block — always use the wrapper
- Always set deterministic passwords (`process.env.JP_OWNER_PASSWORD`) on login-capable test users
- Use `resetFixtureRegistry()` in `afterAll()` to clean up

---

## When to Use Library Functions vs Raw SQL

### ✅ Use Library Functions (createTest*) — Default Choice

```typescript
// CORRECT — fixture generates valid IDs and tracks in registry
const company = await createTestCompanyMinimal();
const outlet = await createTestOutletMinimal(company.id);
const user = await createTestUser(company.id);
const item = await createTestItem(company.id);
const variant = await createTestVariant(item.id);
```

**Benefits:**
- IDs generated by DB (no sentinel values)
- FK constraints satisfied automatically
- Records tracked in registry for cleanup
- Schema changes centralized in one place

### ❌ Do NOT Use Ad-Hoc SQL for Setup

```typescript
// WRONG — bypasses fixture registry and FK validation
await pool.execute(
  `INSERT INTO user_role_assignments (company_id, user_id, role_id, outlet_id) VALUES (?, ?, ?, NULL)`,
  [companyId, userId, roleId]
);
```

### ✅ When Ad-Hoc SQL IS Allowed

Ad-hoc SQL is **only permitted** for:

| Use Case | Example |
|----------|---------|
| **Teardown/cleanup** | `DELETE FROM items WHERE id = ?` (only when library cleanup is insufficient) |
| **Read-only verification** | `SELECT COUNT(*) FROM items WHERE company_id = ?` (no setup SQL) |
| **Schema introspection** | `SHOW CREATE TABLE items` |
| **Token cache probing** | Probe validity without modifying state |

**Rule:** If a canonical fixture function exists for your use case, you MUST use it. Ad-hoc SQL is a P0 blocker when fixtures are available.

---

## Fixture Naming Conventions

| Pattern | Example | Returns |
|---------|---------|---------|
| Creator (minimal) | `createTestCompanyMinimal()` | `CompanyFixture` with `.id`, `.code`, `.name` |
| Creator (full) | `createTestCompany()` | `CompanyFixture` (same as minimal for now) |
| Creator with FK | `createTestOutletMinimal(companyId, opts?)` | `OutletFixture` |
| Creator | `createTestUser(companyId, opts?)` | `UserFixture` |
| Creator | `createTestItem(companyId, opts?)` | `ItemFixture` |
| Creator | `createTestVariant(itemId, opts?)` | `VariantFixture` |
| Lookup | `getRoleIdByCode('ADMIN')` | `number` (role ID) |
| Assignment | `assignUserGlobalRole(userId, roleId)` | `void` |
| Permission | `setModulePermission(companyId, roleId, module, resource, mask)` | `void` |
| Factory | `setupUserPermission({...})` | `void` |
| Cleanup (soft) | `resetFixtureRegistry()` | `void` |
| Cleanup (hard) | `cleanupTestFixtures()` | `Promise<void>` |

**Prefix Rule:** All test fixture creators MUST use the `createTest*` prefix to distinguish from production library functions.

---

## Available Fixtures

### Transitional API-Runtime Re-export: `apps/api/src/lib/test-fixtures.ts`

> ⚠️ **This file is a transitional re-export.** Domain fixtures belong in their owner packages. This file delegates to owner packages and provides legacy helpers during migration.

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
2. **Extend the owner package fixture library** — Add a new fixture function to `packages/modules-{domain}/src/test-fixtures/`
3. **Use `withTestTransaction`** — Create data inside a transaction that auto-rollbacks

**Never** insert directly via `db.insertInto()` unless you're intentionally testing raw SQL behavior.

---

## Missing Owner-Package Fixture Function Workflow

When a test requires data that no existing fixture function covers, follow this workflow **before** writing ad-hoc SQL or app-layer fixture duplication.

### Placement Conventions

Domain fixtures MUST live in their **owner packages**:

```
packages/modules-{domain}/src/test-fixtures/
```

**Layer responsibilities:**

| Layer | Responsibility | Location |
|-------|---------------|----------|
| **DB-generic primitives** | Constants, enums, typed helpers, no domain semantics | `@jurnapod/db/test-fixtures` |
| **Domain fixtures** | Entity creators and seed helpers owned by the domain | `packages/modules-{domain}/src/test-fixtures/` |
| **Transitional re-export** | Thin re-exports from owner packages during migration | `apps/api/src/lib/test-fixtures.ts` |

**Thin API wrapper rule:** When a test needs a fixture from a module package, the wrapper lives in `apps/api/src/lib/test-fixtures.ts` and delegates to the package function. The package function is the canonical source; the wrapper is a transitional re-export. New domain fixtures MUST NOT be added to the wrapper — they belong in the owner package.

### Step-by-Step Workflow

**Step 1 — Identify the owner package.**
Determine which package owns the domain invariant for the missing fixture. The owner package is the one whose production code creates or manages the entity.

**Step 2 — Create `packages/{module}/src/test-fixtures/` if absent.**
Add `test-fixtures.ts` (or split into `fixtures-*.ts`) inside the package's `src/`. Do not place test fixtures in `__test__/` — they are production helpers usable by all consumers.

**Step 3 — Define the fixture function contract.**
A fixture function MUST satisfy all of the following:

| Requirement | Description |
|-------------|-------------|
| **Deterministic defaults** | All optional fields have stable defaults; no `Math.random()` or `Date.now()` for fields that affect business logic |
| **Typed input** | Accept an `opts` object with explicit TypeScript types; no `any` |
| **Typed output** | Return a typed fixture object (e.g., `CompanyFixture`) with `.id` and required fields |
| **Cleanup registration** | Register the created record in the caller's fixture registry so cleanup functions can reach it |
| **Invariant-safe production path** | Use the same write path (service/repository) that production code uses; do not bypass domain logic with raw INSERTs |

**Step 4 — Export from the package index.**
```typescript
// packages/modules/accounting/src/index.ts
export { createTestFiscalYear } from './test-fixtures/fiscal-year-fixtures';
```

**Step 5 — Build the owner package first.**
```bash
npm run build -w @jurnapod/modules-accounting
```
Build MUST succeed before any consuming app can use the new fixture.

**Step 6 — Run validation in order.**
```bash
# 1. Build the target app (verifies index export resolution)
npm run build -w @jurnapod/api

# 2. Run fixture-flow lint to catch violations
npm run lint:fixture-flow -w @jurnapod/api

# 3. Run the affected tests
npm test -w @jurnapod/api -- --run
```

**Step 7 — Export from the owner package index and re-export in API wrapper (if needed).**
If the fixture is consumed by multiple apps, export it from `packages/modules-{domain}/src/index.ts`, then add a thin re-export in `apps/api/src/lib/test-fixtures.ts` only when required for existing consumer paths. Do not duplicate business logic in the wrapper.

### Function Signature Template

```typescript
// packages/modules/inventory/src/test-fixtures/item-fixtures.ts
import { Pool } from 'mysql2/promise';
import { createItem } from '../services/item-service'; // production path

export interface ItemFixture {
  id: number;
  companyId: number;
  name: string;
  sku: string;
}

export interface CreateItemFixtureOptions {
  companyId: number;
  name?: string;        // deterministic default
  sku?: string;         // deterministic default
  pool: Pool;
}

export async function createTestItem(
  options: CreateItemFixtureOptions
): Promise<ItemFixture> {
  const { companyId, pool } = options;
  const name = options.name ?? `Test Item ${Date.now()}`;
  const sku = options.sku ?? `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Use the production service path — invariant-safe
  const item = await createItem({ companyId, name, sku }, { db: pool });

  return {
    id: item.id,
    companyId: item.companyId,
    name: item.name,
    sku: item.sku,
  };
}
```

### Anti-Patterns

| Anti-Pattern | Why Blocked |
|-------------|-------------|
| **Raw `INSERT` SQL in test setup** | Bypasses fixture registry, FK validation, and domain invariants. P0 blocker when a fixture function exists or can be created. |
| **App-layer business fixture duplication** | Re-implements domain logic outside the owner package; diverges from production path over time. |
| **Using `teardown` tag for setup writes** | Teardown runs after assertions; setup must run in `beforeAll`/`beforeEach`. Misusing teardown causes ordering bugs and cryptic failures. |
| **`company_id=1` hardcoded** | Sentinel value violates FK constraints; no guarantee the row exists. |
| **Non-deterministic defaults in business fields** | `Date.now()` in name/sku fields causes test flakiness and makes snapshots unreproducible. |

### Validation Checklist

Before marking a story done when a new fixture was added:

- [ ] Owner package builds without errors (`npm run build -w @jurnapod/{module}`)
- [ ] Package index exports the new fixture function
- [ ] Consuming app builds without import errors
- [ ] `npm run lint:fixture-flow -w @jurnapod/api` passes
- [ ] Tests using the new fixture run and pass
- [ ] Function signature follows the contract (deterministic defaults, typed I/O, cleanup registration)

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
