# Technical Specification: packages/db Kysely-Only Migration

**Status:** Draft  
**Date:** 2026-03-30  
**Owner:** Architecture Team  
**Scope:** `@jurnapod/db` package  

---

## 1. Overview

### 1.1 Objective

Migrate the `@jurnapod/db` package from a hybrid `DbConn` wrapper pattern to a pure Kysely-only architecture. This eliminates the `DbConn` class abstraction and exposes Kysely directly as the primary database interface.

### 1.2 Goals

- **Simplify API**: Remove the wrapper layer and use Kysely's native API
- **Reduce Complexity**: Eliminate manual transaction handling code
- **Standardize**: Align with Kysely community patterns and documentation
- **Maintain Type Safety**: Preserve full TypeScript schema type inference
- **Clean Break**: No deprecation period - direct migration

### 1.3 Non-Goals

- This specification does NOT cover consumer migration (handled separately)
- No backward compatibility layer or deprecation warnings
- No changes to the database schema or migrations
- No changes to connection pooling behavior (still uses mysql2 internally)

---

## 2. Current State Analysis

### 2.1 Architecture Overview

The current `@jurnapod/db` package uses a two-layer architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                      Consumer Code                          │
│  ┌──────────────┐  ┌────────────────────────────────────┐  │
│  │  Raw SQL     │  │  Kysely Queries                    │  │
│  │  db.query()  │  │  db.kysely.selectFrom()...         │  │
│  └──────────────┘  └────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │    DbConn     │  ← Wrapper class
                    │  ┌─────────┐  │     (mysql-client.ts)
                    │  │ mysql2  │  │
                    │  │  Pool   │  │  ← Connection pool
                    │  └─────────┘  │     (pool.ts)
                    │  ┌─────────┐  │
                    │  │ Kysely  │  │  ← Query builder
                    │  │ Instance│  │     (kysely/)
                    │  └─────────┘  │
                    └───────────────┘
```

### 2.2 Current File Structure

```
packages/db/src/
├── index.ts              # Re-exports everything
├── mysql-client.ts       # DbConn class (316 lines)
├── jurnapod-client.ts    # JurnapodDbClient interface (211 lines)
├── pool.ts               # Pool factory (91 lines)
├── pool.test.ts          # Pool tests
├── mysql-client.test.ts  # DbConn tests (to be deleted)
└── kysely/
    ├── index.ts          # createKysely(pool) - takes pool arg
    ├── schema.ts         # Auto-generated DB types
    └── schema-extended.ts # Manual type extensions
```

### 2.3 Current Usage Patterns

**Pattern 1: Raw SQL via DbConn**
```typescript
import { DbConn, createDbPool } from '@jurnapod/db';

const pool = createDbPool({ uri: 'mysql://...' });
const db = new DbConn(pool);

// Raw SQL queries
const rows = await db.queryAll<RowDataPacket>(
  'SELECT * FROM accounts WHERE company_id = ?',
  [companyId]
);

const result = await db.execute(
  'INSERT INTO accounts (company_id, code) VALUES (?, ?)',
  [companyId, code]
);
```

**Pattern 2: Kysely via DbConn.kysely**
```typescript
// Through DbConn wrapper
const accounts = await db.kysely
  .selectFrom('accounts')
  .where('company_id', '=', companyId)
  .selectAll()
  .execute();
```

**Pattern 3: Manual Transactions**
```typescript
await db.beginTransaction();
try {
  await db.execute('INSERT INTO ...', [...]);
  await db.commit();
} catch (error) {
  await db.rollback();
  throw error;
}
```

**Pattern 4: Direct Kysely (Legacy)**
```typescript
import { createKysely } from '@jurnapod/db/kysely';

const kyselyDb = createKysely(pool);  // Takes pool as argument
```

### 2.4 Problems with Current State

1. **Dual API Surface**: Consumers must learn both DbConn methods AND Kysely API
2. **Redundant Abstraction**: DbConn wraps mysql2 but Kysely already handles connections
3. **Transaction Complexity**: Manual begin/commit/rollback vs Kysely's automatic handling
4. **Maintenance Burden**: DbConn (316 lines) + JurnapodDbClient interface (211 lines) to maintain
5. **Pool Management**: Consumers must create and manage pool separately

---

## 3. Target State Design

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Consumer Code                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Kysely Native API                        │  │
│  │  const db = createKysely({ uri: '...' })              │  │
│  │                                                       │  │
│  │  await db.transaction().execute(async (trx) => {      │  │
│  │    await trx.insertInto('accounts')...                │  │
│  │  })                                                   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │    Kysely     │  ← Primary interface
                    │  ┌─────────┐  │
                    │  │ MysqlDialect  │
                    │  │ ┌─────┐ │  │
                    │  │ │mysql2│ │  │  ← Internal pool
                    │  │ │Pool │ │  │     (not exposed)
                    │  │ └─────┘ │  │
                    │  └─────────┘  │
                    └───────────────┘
```

### 3.2 Target File Structure

```
packages/db/src/
├── index.ts              # Clean public API exports only
├── pool.ts               # Internal pool factory (NOT exported)
├── pool.test.ts          # Pool tests (keep)
└── kysely/
    ├── index.ts          # createKysely(), getKysely()
    ├── schema.ts         # Auto-generated DB types
    ├── schema-extended.ts # Manual type extensions
    └── transaction.ts    # [NEW] Optional transaction helpers
```

**Deleted Files:**
- `src/mysql-client.ts` - DbConn class (316 lines)
- `src/jurnapod-client.ts` - JurnapodDbClient interface (211 lines)
- `src/mysql-client.test.ts` - DbConn tests

### 3.3 Target Public API

```typescript
// Core Kysely (re-exported)
export { Kysely, sql } from 'kysely';
export type { DB, Transaction } from 'kysely';

// Schema types
export type { DB as DatabaseSchema } from './kysely/schema.js';

// Factory functions
export { createKysely } from './kysely/index.js';
export { getKysely } from './kysely/index.js';

// Config type (for createKysely argument)
export type { DbPoolConfig } from './pool.js';
```

### 3.4 Target Usage Patterns

**Pattern 1: Create Kysely Instance**
```typescript
import { createKysely } from '@jurnapod/db';

const db = createKysely({
  uri: 'mysql://user:pass@localhost:3306/jurnapod'
});

// All queries through Kysely API
const accounts = await db
  .selectFrom('accounts')
  .where('company_id', '=', companyId)
  .selectAll()
  .execute();

// Cleanup when done
await db.destroy();  // Closes internal pool
```

**Pattern 2: Singleton Pattern (API Server)**
```typescript
import { getKysely } from '@jurnapod/db';

// First call creates instance
const db = getKysely({ uri: 'mysql://...' });

// Subsequent calls return same instance
const sameDb = getKysely({ uri: 'mysql://...' }); // Returns cached instance

// Global cleanup on shutdown
await db.destroy();
```

**Pattern 3: Kysely Transactions**
```typescript
// Automatic transaction with auto-rollback on error
await db.transaction().execute(async (trx) => {
  await trx
    .insertInto('journal_batches')
    .values({ company_id: companyId, name: 'Batch 1' })
    .execute();
    
  await trx
    .insertInto('journal_entries')
    .values({ batch_id: batchId, amount: 1000 })
    .execute();
    
  // Auto-committed on success
  // Auto-rolled back on error
});
```

**Pattern 4: Manual Rollback**
```typescript
await db.transaction().execute(async (trx) => {
  const result = await trx
    .insertInto('orders')
    .values({ ... })
    .executeTakeFirst();
    
  if (shouldCancel) {
    // Trigger rollback by throwing
    throw new Error('Order cancelled');
  }
  
  await trx.insertInto('order_items').values([...]).execute();
});
```

---

## 4. File-by-File Changes

### 4.1 Deleted Files

#### 4.1.1 `src/mysql-client.ts`
**Lines:** 316  
**Reason:** DbConn wrapper no longer needed. Kysely provides all required functionality.

Key functionality to migrate:
- `db.query()` / `db.queryAll()` / `db.queryOne()` → Use Kysely `.selectFrom()` or `sql` template tag
- `db.execute()` → Use Kysely `.insertInto()` / `.updateTable()` / `.deleteFrom()`
- `db.beginTransaction()` / `commit()` / `rollback()` → Use Kysely `db.transaction().execute()`
- `db.withTransaction()` → Use Kysely transaction pattern

#### 4.1.2 `src/jurnapod-client.ts`
**Lines:** 211  
**Reason:** Interface no longer needed. Consumers type against Kysely<DB> directly.

#### 4.1.3 `src/mysql-client.test.ts`
**Lines:** ~200  
**Reason:** Tests for deleted class. Equivalent coverage through Kysely integration tests.

### 4.2 Created Files

#### 4.2.1 `src/kysely/transaction.ts` (Optional)
**Purpose:** Transaction helper utilities if common patterns emerge

```typescript
/**
 * Execute a callback within a transaction.
 * Rolls back on error, commits on success.
 * 
 * This is a thin wrapper around Kysely's transaction API
 * for consumers who prefer a function-based approach.
 */
export async function withTransaction<T>(
  db: Kysely<DB>,
  callback: (trx: Transaction<DB>) => Promise<T>
): Promise<T> {
  return db.transaction().execute(callback);
}
```

**Decision:** Only create if recurring patterns emerge in consumer migration.

### 4.3 Modified Files

#### 4.3.1 `src/index.ts`

**Current State:**
```typescript
export * from './kysely/index.js';
export * from './jurnapod-client.js';
export * from './mysql-client.js';
export * from './pool.js';
```

**Target State:**
```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Jurnapod Database Package - Kysely Edition
 * 
 * Pure Kysely interface for type-safe SQL queries.
 * No wrapper abstractions - use Kysely directly.
 * 
 * @example
 * ```typescript
 * import { createKysely, sql } from '@jurnapod/db';
 * 
 * const db = createKysely({ uri: 'mysql://...' });
 * 
 * // Type-safe query
 * const accounts = await db
 *   .selectFrom('accounts')
 *   .where('company_id', '=', companyId)
 *   .selectAll()
 *   .execute();
 * 
 * // Raw SQL with type safety
 * const result = await sql`SELECT * FROM accounts`.execute(db);
 * 
 * // Transaction
 * await db.transaction().execute(async (trx) => {
 *   await trx.insertInto('accounts').values({ ... }).execute();
 * });
 * 
 * // Cleanup
 * await db.destroy();
 * ```
 */

// Core Kysely - re-export for convenience
export { Kysely, sql } from 'kysely';
export type { Transaction, Sql } from 'kysely';

// Schema types
export type { DB as DatabaseSchema } from './kysely/schema.js';

// Factory functions
export { createKysely, getKysely } from './kysely/index.js';

// Config type for passing to createKysely
export type { DbPoolConfig } from './pool.js';
```

#### 4.3.2 `src/kysely/index.ts`

**Current State:**
```typescript
export function createKysely(pool: Pool): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new MysqlDialect({ pool })
  });
}

export type { DB } from './schema';
export type { Kysely } from 'kysely';
```

**Target State:**
```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Kysely factory functions for Jurnapod.
 * 
 * Provides two patterns:
 * 1. createKysely(config) - Create new instance (you manage lifecycle)
 * 2. getKysely(config)    - Singleton pattern (cached instance)
 */

import { Kysely, MysqlDialect } from 'kysely';
import type { DB } from './schema.js';
import { createDbPool, type DbPoolConfig } from '../pool.js';

// Singleton instance cache
let singletonInstance: Kysely<DB> | null = null;
let singletonConfigKey: string | null = null;

/**
 * Create a new Kysely instance with internal pool management.
 * 
 * @param config - Database connection configuration
 * @returns Kysely instance with internally-managed pool
 * 
 * @example
 * ```typescript
 * import { createKysely } from '@jurnapod/db';
 * 
 * const db = createKysely({
 *   uri: 'mysql://user:pass@localhost:3306/jurnapod?charset=utf8mb4'
 * });
 * 
 * const accounts = await db
 *   .selectFrom('accounts')
 *   .where('company_id', '=', 1)
 *   .selectAll()
 *   .execute();
 * 
 * // Clean up when done
 * await db.destroy();
 * ```
 */
export function createKysely(config: DbPoolConfig): Kysely<DB> {
  const pool = createDbPool(config);
  
  return new Kysely<DB>({
    dialect: new MysqlDialect({
      pool: pool as any  // mysql2 callback pool compatible
    })
  });
}

/**
 * Get or create a singleton Kysely instance.
 * 
 * Creates instance on first call, returns cached instance on subsequent calls.
 * Different configs create different singletons (keyed by config hash).
 * 
 * Use this for API server pattern where you want a single DB connection
 * throughout the application lifecycle.
 * 
 * @param config - Database connection configuration
 * @returns Cached or new Kysely instance
 * 
 * @example
 * ```typescript
 * import { getKysely } from '@jurnapod/db';
 * 
 * // In application initialization
 * const db = getKysely({ uri: process.env.DATABASE_URL! });
 * 
 * // In routes/controllers - same instance
 * const sameDb = getKysely({ uri: process.env.DATABASE_URL! });
 * 
 * // On shutdown
 * await db.destroy();
 * ```
 */
export function getKysely(config: DbPoolConfig): Kysely<DB> {
  const configKey = config.uri || 
    `${config.host}:${config.port}:${config.database}`;
  
  if (!singletonInstance || singletonConfigKey !== configKey) {
    singletonInstance = createKysely(config);
    singletonConfigKey = configKey;
  }
  
  return singletonInstance;
}

// Re-export types for convenience
export type { DB } from './schema.js';
export type { Kysely } from 'kysely';
```

#### 4.3.3 `src/pool.ts`

**Changes:** None to implementation, remove from public exports

**Current Exports (via index.ts):**
- `createDbPool()` - Exported
- `DbPoolConfig` - Exported as type

**Target Exports:**
- `createDbPool()` - **NOT exported** (internal only)
- `DbPoolConfig` - Exported as type only (for createKysely argument)

#### 4.3.4 `src/pool.test.ts`

**Changes:** None - keep existing tests

---

## 5. Public API Specification

### 5.1 Core Exports

| Export | Type | Description |
|--------|------|-------------|
| `Kysely` | Class | Re-exported from 'kysely' |
| `sql` | Template tag | Re-exported from 'kysely' for raw SQL |
| `Transaction` | Type | Re-exported transaction type |
| `Sql` | Type | Re-exported SQL builder type |

### 5.2 Schema Types

| Export | Type | Description |
|--------|------|-------------|
| `DatabaseSchema` | Type alias | `DB` type from schema.ts |
| `DB` | Type | Original Kysely schema type |

### 5.3 Factory Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `createKysely` | `(config: DbPoolConfig) => Kysely<DB>` | Creates new instance with internal pool |
| `getKysely` | `(config: DbPoolConfig) => Kysely<DB>` | Returns singleton instance |

### 5.4 Configuration Type

```typescript
interface DbPoolConfig {
  uri?: string;                    // Full connection URI
  host?: string;                   // Database host
  port?: number;                   // Database port
  user?: string;                   // Username
  password?: string;               // Password
  database?: string;               // Database name
  charset?: string;                // Character set (default: utf8mb4)
  connectionLimit?: number;        // Pool size (default: 10)
  dateStrings?: boolean;           // Return dates as strings (default: true)
  enableKeepAlive?: boolean;       // TCP keepalive (default: true)
  keepAliveInitialDelay?: number;  // Keepalive delay (default: 10000ms)
}
```

---

## 6. Usage Examples

### 6.1 Basic CRUD Operations

```typescript
import { createKysely } from '@jurnapod/db';

const db = createKysely({ uri: 'mysql://...' });

// SELECT
type Account = {
  id: number;
  code: string;
  name: string;
  company_id: number;
};

const accounts = await db
  .selectFrom('accounts')
  .where('company_id', '=', companyId)
  .where('deleted_at', 'is', null)
  .select(['id', 'code', 'name', 'company_id'])
  .execute();

// SELECT single row
const account = await db
  .selectFrom('accounts')
  .where('id', '=', accountId)
  .where('company_id', '=', companyId)
  .selectAll()
  .executeTakeFirst();

// INSERT
const newAccount = await db
  .insertInto('accounts')
  .values({
    company_id: companyId,
    code: '1000',
    name: 'Cash',
    is_active: true
  })
  .returningAll()
  .executeTakeFirst();

// UPDATE
await db
  .updateTable('accounts')
  .set({ name: 'Cash on Hand' })
  .where('id', '=', accountId)
  .execute();

// DELETE (soft delete pattern)
await db
  .updateTable('accounts')
  .set({ deleted_at: new Date() })
  .where('id', '=', accountId)
  .execute();

// Cleanup
await db.destroy();
```

### 6.2 Complex Queries

```typescript
import { createKysely, sql } from '@jurnapod/db';

const db = createKysely({ uri: 'mysql://...' });

// JOIN with aggregation
const summary = await db
  .selectFrom('orders')
  .innerJoin('order_items', 'order_items.order_id', 'orders.id')
  .where('orders.company_id', '=', companyId)
  .where('orders.created_at', '>=', startDate)
  .groupBy('orders.status')
  .select([
    'orders.status',
    db.fn.count('orders.id').as('order_count'),
    db.fn.sum('order_items.total').as('total_amount')
  ])
  .execute();

// Raw SQL with parameters (type-safe)
const searchTerm = '%' + query + '%';
const results = await sql<Account>`
  SELECT * FROM accounts 
  WHERE company_id = ${companyId}
    AND (code LIKE ${searchTerm} OR name LIKE ${searchTerm})
`.execute(db);

// Subquery
const activeAccounts = await db
  .selectFrom('accounts')
  .where('company_id', '=', companyId)
  .where('id', 'in', 
    db.selectFrom('journal_entries')
      .select('account_id')
      .where('created_at', '>=', lastMonth)
  )
  .selectAll()
  .execute();
```

### 6.3 Transaction Patterns

```typescript
import { createKysely } from '@jurnapod/db';

const db = createKysely({ uri: 'mysql://...' });

// Pattern 1: Automatic transaction
await db.transaction().execute(async (trx) => {
  // All queries use transaction connection
  const batch = await trx
    .insertInto('journal_batches')
    .values({ company_id: companyId, name: 'Month-end' })
    .returning('id')
    .executeTakeFirstOrThrow();

  await trx
    .insertInto('journal_entries')
    .values([
      { batch_id: batch.id, account_id: 1, debit: 1000 },
      { batch_id: batch.id, account_id: 2, credit: 1000 }
    ])
    .execute();
    
  // Auto-committed on success
  // Auto-rolled back on error
});

// Pattern 2: Read-only transaction
await db.transaction().execute(async (trx) => {
  const accounts = await trx
    .selectFrom('accounts')
    .where('company_id', '=', companyId)
    .selectAll()
    .execute();
    
  const balances = await trx
    .selectFrom('journal_entries')
    .where('account_id', 'in', accounts.map(a => a.id))
    .groupBy('account_id')
    .select(['account_id', trx.fn.sum('amount').as('balance')])
    .execute();
    
  // Read-only, still committed (no-op)
});

// Pattern 3: Conditional rollback
await db.transaction().execute(async (trx) => {
  const order = await trx
    .insertInto('orders')
    .values({ company_id: companyId, total: 100 })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Check inventory
  const inventory = await trx
    .selectFrom('inventory')
    .where('item_id', '=', itemId)
    .select('quantity')
    .executeTakeFirst();

  if (!inventory || inventory.quantity < 1) {
    // Rollback by throwing
    throw new Error('Insufficient inventory');
  }

  await trx
    .insertInto('order_items')
    .values({ order_id: order.id, item_id: itemId })
    .execute();
    
  await trx
    .updateTable('inventory')
    .set({ quantity: inventory.quantity - 1 })
    .where('item_id', '=', itemId)
    .execute();
});

// Pattern 4: Multiple operations, single transaction
async function createInvoiceWithItems(
  db: Kysely<DB>,
  invoiceData: InvoiceInput,
  items: InvoiceItemInput[]
): Promise<Invoice> {
  return db.transaction().execute(async (trx) => {
    const invoice = await trx
      .insertInto('invoices')
      .values(invoiceData)
      .returningAll()
      .executeTakeFirstOrThrow();

    if (items.length > 0) {
      await trx
        .insertInto('invoice_items')
        .values(items.map(item => ({ ...item, invoice_id: invoice.id })))
        .execute();
    }

    return { ...invoice, items };
  });
}
```

### 6.4 API Server Pattern

```typescript
// src/lib/db.ts (in API app)
import { getKysely, type Kysely, type DatabaseSchema } from '@jurnapod/db';

let db: Kysely<DatabaseSchema> | null = null;

export function getDb(): Kysely<DatabaseSchema> {
  if (!db) {
    db = getKysely({
      uri: process.env.DATABASE_URL!,
      connectionLimit: 20
    });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
}

// src/server.ts
import { getDb, closeDb } from './lib/db.js';

// Initialize on startup
const db = getDb();

// Use throughout application
app.get('/accounts', async (req, res) => {
  const accounts = await getDb()
    .selectFrom('accounts')
    .where('company_id', '=', req.companyId)
    .selectAll()
    .execute();
  res.json(accounts);
});

// Cleanup on shutdown
process.on('SIGTERM', async () => {
  await closeDb();
  process.exit(0);
});
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

**File:** `src/kysely/index.test.ts` (new)

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createKysely, getKysely } from './index.js';
import type { DB } from './schema.js';
import type { Kysely } from 'kysely';

describe('createKysely', () => {
  let db: Kysely<DB>;

  afterEach(async () => {
    if (db) {
      await db.destroy();
    }
  });

  test('creates Kysely instance with URI', async () => {
    db = createKysely({
      uri: process.env.TEST_DATABASE_URL!
    });
    
    const result = await db.selectFrom('companies')
      .select(db.fn.count('id').as('count'))
      .executeTakeFirst();
      
    expect(result).toBeDefined();
  });

  test('creates Kysely instance with connection params', async () => {
    db = createKysely({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'password',
      database: 'jurnapod'
    });
    
    const result = await db.selectFrom('companies')
      .select(db.fn.count('id').as('count'))
      .executeTakeFirst();
      
    expect(result).toBeDefined();
  });

  test('destroy() closes pool', async () => {
    db = createKysely({ uri: process.env.TEST_DATABASE_URL! });
    
    // Should work before destroy
    await db.selectFrom('companies').selectAll().execute();
    
    await db.destroy();
    
    // Should fail after destroy
    await expect(
      db.selectFrom('companies').selectAll().execute()
    ).rejects.toThrow();
  });
});

describe('getKysely', () => {
  let db: Kysely<DB>;

  afterEach(async () => {
    if (db) {
      await db.destroy();
    }
  });

  test('returns same instance for same config', () => {
    const db1 = getKysely({ uri: 'mysql://test1' });
    const db2 = getKysely({ uri: 'mysql://test1' });
    
    expect(db1).toBe(db2);
    db = db1;
  });

  test('returns different instance for different config', () => {
    const db1 = getKysely({ uri: 'mysql://test1' });
    const db2 = getKysely({ uri: 'mysql://test2' });
    
    expect(db1).not.toBe(db2);
    db = db1;
  });
});
```

### 7.2 Integration Tests

**File:** `src/kysely/integration.test.ts` (new)

```typescript
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createKysely } from './index.js';
import type { DB } from './schema.js';
import type { Kysely } from 'kysely';

describe('Kysely Integration', () => {
  let db: Kysely<DB>;

  beforeAll(() => {
    db = createKysely({ uri: process.env.TEST_DATABASE_URL! });
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('CRUD operations', () => {
    test('insert and select', async () => {
      const company = await db
        .insertInto('companies')
        .values({ name: 'Test Co', code: 'TEST' + Date.now() })
        .returningAll()
        .executeTakeFirst();

      expect(company).toBeDefined();
      expect(company!.name).toBe('Test Co');

      const fetched = await db
        .selectFrom('companies')
        .where('id', '=', company!.id)
        .selectAll()
        .executeTakeFirst();

      expect(fetched).toEqual(company);
    });

    test('update', async () => {
      const company = await db
        .insertInto('companies')
        .values({ name: 'Update Test', code: 'UPD' + Date.now() })
        .returningAll()
        .executeTakeFirst();

      await db
        .updateTable('companies')
        .set({ name: 'Updated Name' })
        .where('id', '=', company!.id)
        .execute();

      const updated = await db
        .selectFrom('companies')
        .where('id', '=', company!.id)
        .select('name')
        .executeTakeFirst();

      expect(updated!.name).toBe('Updated Name');
    });

    test('delete', async () => {
      const company = await db
        .insertInto('companies')
        .values({ name: 'Delete Test', code: 'DEL' + Date.now() })
        .returningAll()
        .executeTakeFirst();

      await db
        .deleteFrom('companies')
        .where('id', '=', company!.id)
        .execute();

      const deleted = await db
        .selectFrom('companies')
        .where('id', '=', company!.id)
        .selectAll()
        .executeTakeFirst();

      expect(deleted).toBeUndefined();
    });
  });

  describe('transactions', () => {
    test('commits on success', async () => {
      const code = 'TRX' + Date.now();
      
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('companies')
          .values({ name: 'Transaction Test', code })
          .execute();
      });

      const company = await db
        .selectFrom('companies')
        .where('code', '=', code)
        .selectAll()
        .executeTakeFirst();

      expect(company).toBeDefined();
    });

    test('rolls back on error', async () => {
      const code = 'ROLLBACK' + Date.now();
      
      await expect(
        db.transaction().execute(async (trx) => {
          await trx
            .insertInto('companies')
            .values({ name: 'Rollback Test', code })
            .execute();
          
          throw new Error('Force rollback');
        })
      ).rejects.toThrow('Force rollback');

      const company = await db
        .selectFrom('companies')
        .where('code', '=', code)
        .selectAll()
        .executeTakeFirst();

      expect(company).toBeUndefined();
    });

    test('multiple operations in transaction', async () => {
      const batchCode = 'BATCH' + Date.now();
      
      await db.transaction().execute(async (trx) => {
        const batch = await trx
          .insertInto('journal_batches')
          .values({ 
            company_id: 1, 
            name: 'Test Batch',
            code: batchCode
          })
          .returning('id')
          .executeTakeFirstOrThrow();

        await trx
          .insertInto('journal_entries')
          .values([
            { batch_id: batch.id, account_id: 1, debit: 1000 },
            { batch_id: batch.id, account_id: 2, credit: 1000 }
          ])
          .execute();
      });

      const entries = await db
        .selectFrom('journal_entries')
        .innerJoin('journal_batches', 'journal_batches.id', 'journal_entries.batch_id')
        .where('journal_batches.code', '=', batchCode)
        .selectAll()
        .execute();

      expect(entries).toHaveLength(2);
    });
  });
});
```

### 7.3 Test Coverage Requirements

| Area | Coverage | Notes |
|------|----------|-------|
| createKysely() | Unit + Integration | URI and params config, destroy behavior |
| getKysely() | Unit | Singleton caching logic |
| CRUD operations | Integration | Through actual Kysely queries |
| Transactions | Integration | Commit, rollback, error handling |
| Pool lifecycle | Unit | Proper cleanup on destroy |

### 7.4 Existing Tests

| File | Action | Notes |
|------|--------|-------|
| `pool.test.ts` | **Keep** | Pool creation still tested |
| `mysql-client.test.ts` | **Delete** | DbConn no longer exists |

---

## 8. Migration Path for Consumers

### 8.1 Before → After Mapping

| Current Pattern | New Pattern |
|-----------------|-------------|
| `new DbConn(pool)` | `createKysely({ uri: '...' })` |
| `db.queryAll('SELECT ...', [params])` | `db.selectFrom('table').where(...).execute()` |
| `db.execute('INSERT ...', [params])` | `db.insertInto('table').values({...}).execute()` |
| `db.beginTransaction()` / `commit()` / `rollback()` | `db.transaction().execute(async (trx) => { ... })` |
| `db.withTransaction(sql, params)` | `db.transaction().execute(async (trx) => { await trx... })` |
| `db.kysely.selectFrom(...)` | `db.selectFrom(...)` (direct) |
| `import { createKysely } from '@jurnapod/db/kysely'` | `import { createKysely } from '@jurnapod/db'` |

### 8.2 Migration Example

**Before:**
```typescript
import { createDbPool, DbConn } from '@jurnapod/db';
import type { RowDataPacket } from 'mysql2';

const pool = createDbPool({ uri: process.env.DATABASE_URL! });
const db = new DbConn(pool);

// Raw SQL query
const accounts = await db.queryAll<RowDataPacket>(
  'SELECT * FROM accounts WHERE company_id = ? AND is_active = 1',
  [companyId]
);

// Transaction
await db.beginTransaction();
try {
  await db.execute('INSERT INTO accounts ...', [...]);
  await db.commit();
} catch (error) {
  await db.rollback();
  throw error;
}
```

**After:**
```typescript
import { createKysely } from '@jurnapod/db';

const db = createKysely({ uri: process.env.DATABASE_URL! });

// Type-safe Kysely query
const accounts = await db
  .selectFrom('accounts')
  .where('company_id', '=', companyId)
  .where('is_active', '=', 1)
  .selectAll()
  .execute();

// Transaction
await db.transaction().execute(async (trx) => {
  await trx.insertInto('accounts').values({ ... }).execute();
  // Auto-committed on success, rolled back on error
});
```

---

## 9. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Consumer breakage | High | Certain | Consumer migration handled separately, this is breaking change by design |
| Transaction pattern confusion | Medium | Medium | Document Kysely transaction patterns with examples |
| Pool cleanup missed | Medium | Low | `db.destroy()` documented, Kysely handles pool lifecycle |
| Type inference issues | Low | Low | Full schema types preserved, Kysely has excellent inference |
| Performance regression | Low | Low | Same mysql2 pool underneath, benchmark if concerned |

---

## 10. Implementation Checklist

### 10.1 Package Changes

- [ ] Delete `src/mysql-client.ts`
- [ ] Delete `src/jurnapod-client.ts`
- [ ] Delete `src/mysql-client.test.ts`
- [ ] Rewrite `src/index.ts` with clean exports
- [ ] Update `src/kysely/index.ts` with `createKysely()` and `getKysely()`
- [ ] Update `src/pool.ts` exports (remove `createDbPool` from public API)
- [ ] Create `src/kysely/index.test.ts`
- [ ] Create `src/kysely/integration.test.ts`
- [ ] Update `package.json` exports if needed

### 10.2 Documentation

- [ ] Update package README.md
- [ ] Update AGENTS.md for package
- [ ] Create migration guide for consumers

### 10.3 Validation

- [ ] All new unit tests pass
- [ ] All new integration tests pass
- [ ] TypeScript type check passes
- [ ] Package builds successfully
- [ ] No references to deleted files remain

---

## 11. References

- [Kysely Documentation](https://kysely.dev/)
- [Kysely MySQL Dialect](https://kysely.dev/docs/dialects/mysql)
- [Kysely Transactions](https://kysely.dev/docs/category/transactions)
- [mysql2 Package](https://github.com/sidorares/node-mysql2)
- Existing Tech Spec: [Epic 7: Operational Hardening](./epic-7-operational-hardening.md)

---

**Document Version:** 1.0  
**Last Updated:** 2026-03-30  
**Status:** Ready for Implementation
