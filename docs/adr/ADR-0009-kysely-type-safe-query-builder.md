<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# ADR-0009: Kysely Type-Safe Query Builder

**Status:** Accepted
**Date:** 2026-03-26
**Deciders:** Ahmad Faruk (Signal18 ID)

---

## Context

The API needs type-safe database queries across all route modules. The key requirements for Jurnapod's financial domain are:

- **Developer velocity**: Repetitive CRUD boilerplate with raw SQL reduces productivity.
- **Audit priority**: Generated SQL must be predictable and reviewable.
- **N+1 control**: Query builder must not auto-generate queries that cause N+1 problems.
- **Dual compatibility**: All queries must run on both MySQL 8.0.44+ and MariaDB.

Epic 0 evaluated ORM adoption to address developer velocity while maintaining explicit SQL control.

---

## Decision

Database access for new code uses **Kysely** — a type-safe SQL query builder that generates explicit SQL without magic.

### Architecture

```
packages/db/src/
├── pool.ts                    # createDbPool(), closeDbPool() - mysql2 pool singleton
├── mysql-client.ts           # DbConn class - unified interface
├── connection-kysely.ts      # newKyselyConnection() - Kysely wrapper
├── jurnapod-client.ts        # JurnapodDbClient interface
└── kysely/
    ├── index.ts              # createKysely() factory
    └── schema.ts             # Auto-generated types (96 tables)
```

### DbConn Class

`DbConn` is the unified database interface wrapping both mysql2 pool and Kysely:

```typescript
// packages/db/src/mysql-client.ts
export class DbConn implements JurnapodDbClient {
  private pool: Pool;
  private kysely: Kysely<DB>;

  constructor(pool: Pool) {
    this.pool = pool;
    this.kysely = new Kysely<DB>({
      dialect: new MysqlDialect({ pool })
    });
  }

  // Raw SQL via mysql2 (for complex queries, upserts, financial-critical SQL)
  async query<T>(sql: string, params?: any[]): Promise<T[]> { ... }
  async execute(sql: string, params?: any[]): Promise<QueryResult> { ... }

  // Kysely queries (for CRUD, type-safe operations)
  get kysely(): Kysely<DB> { return this.kysely; }
}
```

### Pool Singleton

Kysely reuses the existing mysql2 pool singleton:

```typescript
// packages/db/src/pool.ts
import { createPool } from 'mysql2/promise';
import { DbConn } from './mysql-client';

const globalForDb = globalThis as typeof globalThis & {
  __jurnapodApiDbPool?: Pool;
};

export function createDbPool(): Pool {
  if (globalForDb.__jurnapodApiDbPool) {
    return globalForDb.__jurnapodApiDbPool;
  }
  const pool = createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true,  // ← preserve date strings, not Date objects
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  globalForDb.__jurnapodApiDbPool = pool;
  return pool;
}

export function closeDbPool(): Promise<void> { ... }
```

### Incremental Migration Strategy

Migrations happen **route by route** — no big-bang rewrite:

1. Route uses raw SQL → continues working
2. Route migrated to Kysely → uses `db.kysely.selectFrom()`, etc.
3. Mixed usage allowed → `db.query()` for complex SQL, `db.kysely` for CRUD

### Kysely Usage Patterns

**Select with type safety:**
```typescript
const rows = await db.kysely
  .selectFrom('tax_rates')
  .where('company_id', '=', companyId)
  .where('deleted_at', 'is', null)
  .select(['id', 'name', 'rate', 'is_default'])
  .execute();
```

**Count query:**
```typescript
const result = await db.kysely
  .selectFrom('users')
  .where('company_id', '=', companyId)
  .select((eb) => [eb.fn.count('id').as('count')])
  .executeTakeFirst();

const count = Number(result?.count ?? 0);
```

**Insert with returning:**
```typescript
const row = await db.kysely
  .insertInto('tax_rates')
  .values({
    company_id: companyId,
    name,
    rate,
    is_default: false,
    created_at: new Date()
  })
  .returningAll()
  .executeTakeFirst();
```

**Update:**
```typescript
const result = await db.kysely
  .updateTable('tax_rates')
  .set({ name, rate, updated_at: new Date() })
  .where('id', '=', id)
  .where('company_id', '=', companyId)
  .executeTakeFirst();

// Use numUpdatedRows (bigint) for affected count
const affected = Number(result?.numUpdatedRows ?? 0);
```

**Delete:**
```typescript
const result = await db.kysely
  .deleteFrom('tax_rates')
  .where('id', '=', id)
  .where('company_id', '=', companyId)
  .executeTakeFirst();

// Use numDeletedRows (bigint), NOT numAffectedRows
const deleted = Number(result?.numDeletedRows ?? 0);
```

**Transaction:**
```typescript
await db.kysely.startTransaction();
try {
  await db.kysely.insertInto('journal_batches').values({ ... }).execute();
  await db.kysely.insertInto('journal_lines').values({ ... }).execute();
  await db.kysely.commitTransaction();
} catch (err) {
  await db.kysely.rollbackTransaction();
  throw err;
}
```

### N+1 Prevention

Kysely does NOT auto-prevent N+1. Prevention is the developer's responsibility via explicit JOINs — same as raw SQL:

```typescript
// BAD: N+1 query
const orders = await db.kysely.selectFrom('orders').selectAll().execute();
for (const order of orders) {
  const customer = await db.kysely
    .selectFrom('customers')
    .where('id', '=', order.customer_id)
    .executeTakeFirst();  // ← N+1!
}

// GOOD: Explicit JOIN
const orders = await db.kysely
  .selectFrom('orders')
  .innerJoin('customers', 'orders.customer_id', 'customers.id')
  .select(['orders.id', 'orders.total', 'customers.name'])
  .execute();
```

---

## Alternatives Considered

### Prisma ORM

Evaluated for type safety and migration tooling. Rejected for three reasons:
1. Prisma's MariaDB support has compatibility gaps with MySQL 8.0.44+ features used in migrations.
2. Prisma coerces `DECIMAL` to JavaScript `number` by default — unacceptable for financial data.
3. Complex financial queries (GL aggregations, reconciliation joins) are easier to write and review in explicit SQL.

### Drizzle ORM

Better type inference than Prisma and supports raw SQL escape hatches. Rejected because:
1. The benefit (TypeScript inference for table shapes) is partially achieved already via typed `RowDataPacket` intersections and Kysely's generated types.
2. Drizzle requires maintaining a separate schema definition that must stay in sync with migration files.

### Raw SQL Only

Continue with mysql2/raw SQL exclusively. Rejected because:
1. Developer velocity suffers on repetitive CRUD operations.
2. Column name typos are runtime errors, not compile-time errors.
3. Kysely provides type safety without sacrificing explicit SQL control.

---

## Epic 1 Lessons Learned (2026-03-26)

Epic 1 continued the Kysely migration with journals and account-types routes. Key patterns discovered:

### Batch/Line Relationship Pattern (Journals)

Journals have batch → lines relationships. N+1 prevention requires explicit JOINs:

```typescript
// GOOD: 2 queries total - batch IDs then all lines
const batches = await db.kysely
  .selectFrom('journal_batches')
  .where('company_id', '=', companyId)
  .select(['id', 'posted_at', 'doc_type'])
  .execute();

const batchIds = batches.map(b => b.id);
const allLines = await db.kysely
  .selectFrom('journal_lines')
  .where('journal_batch_id', 'in', batchIds)
  .execute();

// Group lines by batch in memory
const linesByBatch = new Map<number, JournalLine[]>();
for (const line of allLines) {
  const list = linesByBatch.get(line.journal_batch_id) || [];
  list.push(line);
  linesByBatch.set(line.journal_batch_id, list);
}
```

### Soft-Delete Pattern (Account-Types)

Soft-delete sets `is_active = 0` instead of removing rows:

```typescript
// Check before soft-delete (is in use?)
const result = await db.kysely
  .selectFrom('accounts')
  .where('account_type_id', '=', accountTypeId)
  .where('company_id', '=', companyId)
  .select((eb) => eb.fn.count('id').as('count'))
  .executeTakeFirst();

if (Number(result?.count ?? 0) > 0) {
  throw new AccountTypeInUseError();
}

// Soft-delete via update
await db.kysely
  .updateTable('account_types')
  .set({ is_active: 0 })
  .where('id', '=', accountTypeId)
  .where('company_id', '=', companyId)
  .execute();
```

### When to Preserve Raw SQL

**PRESERVE raw SQL for financial-critical operations:**

1. **Journal creation** (`createManualEntry`): Transaction spans batch + lines with audit logging. Complex business logic best expressed as readable SQL.

2. **GL aggregations**: Complex joins with GROUP BY, SUM, subqueries for reports like trial balance, P&L.

3. **Reconciliation queries**: Multiple conditions, nullable joins, and business-rule filters are clearer in SQL.

```typescript
// Keep as raw SQL - complex financial logic
const glSql = `
  SELECT a.id, a.code, a.name,
    SUM(jl.debit) AS total_debit,
    SUM(jl.credit) AS total_credit
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
  LEFT JOIN journal_batches jb ON jb.id = jl.journal_batch_id
  WHERE a.company_id = ?
    AND a.deleted_at IS NULL
    AND (jb.deleted_at IS NULL OR jb.posted_at >= ?)
  GROUP BY a.id, a.code, a.name
  ORDER BY a.code
`;
```

### Key Takeaways

- **Use Kysely for**: CRUD operations, simple queries, count/check queries, dynamic filter building
- **Preserve raw SQL for**: Financial-critical operations, complex aggregations, reports requiring SQL readability
- **Always prevent N+1**: Batch fetch related data in 2 queries, then group in memory

---

## Epic 2 Lessons Learned (2026-03-26)

Epic 2 migrated sync routes and reports routes, and resolved three persistent N+1 query patterns. Key patterns discovered:

### Sync Routes: Idempotency via `client_tx_id` with Kysely

POS sync push uses `client_tx_id` for deduplication. The batch idempotency pre-check uses Kysely's `where in` for efficient lookup:

```typescript
// Batch pre-check: fast path for already-processed transactions
const existing = await kysely
  .selectFrom("pos_transactions")
  .where("client_tx_id", "in", clientTxIds)
  .select(["client_tx_id"])
  .execute();

const alreadyProcessed = new Set(existing.map(r => r.client_tx_id));
const newTxIds = clientTxIds.filter(id => !alreadyProcessed.has(id));
```

**Key insight**: Kysely is used for the idempotency pre-check (simple `IN` lookup). The actual transaction upsert (with complex conflict resolution) stays as parameterized raw SQL — same pattern as Epic 1's financial queries.

### Sync Routes: Offline-First Batch Upsert Patterns

POS sync push follows **offline-first**: write locally first, then sync via outbox. The orchestrator pattern delegates to domain services:

```
routes/sync/push.ts  →  orchestrateSyncPush()
                              ↓
                      lib/sync/push/batch.ts  →  per-transaction service calls
```

Each transaction result is explicit: `OK`, `DUPLICATE`, `ERROR`. No silent failures.

### Reports Routes: Kysely for Data Retrieval + Raw SQL for Aggregation

Reports are the most complex GL queries. Epic 2 confirmed the boundary established in Epic 1:

| Query Type | Approach | Reason |
|------------|----------|--------|
| Report metadata, filters, list params | Kysely | Simple SELECTs, type-safe |
| GL aggregations (SUM, GROUP BY, CASE WHEN) | Raw SQL | Complex financial logic, easier to audit |
| Multi-table JOINs with subqueries | Raw SQL | Kysely subquery API adds complexity for marginal type-safety benefit |

```typescript
// Keep as raw SQL — GL aggregation with complex business logic
const glSql = `
  SELECT
    a.id, a.code, a.name,
    SUM(jl.debit) AS total_debit,
    SUM(jl.credit) AS total_credit,
    SUM(jl.debit) - SUM(jl.credit) AS balance
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
  LEFT JOIN journal_batches jb ON jb.id = jl.journal_batch_id
  WHERE a.company_id = ?
    AND a.deleted_at IS NULL
    AND (jb.deleted_at IS NULL OR jb.posted_at >= ?)
  GROUP BY a.id, a.code, a.name
  ORDER BY a.code
`;
```

### N+1 Batch Fetch Patterns (TD-001, TD-002, TD-003)

Three N+1 patterns were resolved using the same batch-fetch strategy:

#### TD-001: Batch Item Account Lookup (COGS Posting)

**Before**: Loop over sale items, query `items` + `company_account_mappings` per item.
**After**: Single batch query upfront.

```typescript
// Batch fetch all item accounts in 1 query
export async function getItemAccountsBatch(
  executor: QueryExecutor,
  companyId: number,
  itemIds: number[]
): Promise<Map<number, ItemAccountInfo>> {
  if (itemIds.length === 0) return new Map();

  const rows = await executor.execute<ItemAccountRow[]>(
    `SELECT i.id, i.cogs_account_id, i.inventory_asset_account_id,
            cam.account_id AS cogs_mapping_account_id
     FROM items i
     LEFT JOIN company_account_mappings cam
       ON cam.company_id = i.company_id
       AND cam.entity_type = 'ITEM'
       AND cam.entity_id = i.id
       AND cam.account_type = 'COGS'
     WHERE i.company_id = ? AND i.id IN (${itemIds.map(() => '?').join(',')})`,
    [companyId, ...itemIds]
  );

  // Group in memory
  const map = new Map<number, ItemAccountInfo>();
  for (const row of rows) {
    map.set(Number(row.id), {
      cogsAccountId: row.cogs_account_id ?? row.cogs_mapping_account_id,
      inventoryAssetAccountId: row.inventory_asset_account_id
    });
  }
  return map;
}
```

#### TD-002: Batch COGS Calculation (Inventory Lookup)

**Before**: Per-item `inventory_transactions` lookup loop.
**After**: Single `GROUP BY` query for all items.

```typescript
// Single query for all items' inventory costs
const [rows] = await pool.execute<RowDataPacket[]>(
  `SELECT product_id,
          SUM(quantity_delta) AS net_qty,
          SUM(quantity_delta * unit_cost) AS total_cost
   FROM inventory_transactions
   WHERE company_id = ? AND product_id IN (${ids.map(() => '?').join(',')})
   GROUP BY product_id`,
  [companyId, ...ids]
);
```

#### TD-003: Batch Ingredient Cost Resolution (Recipe Composition)

**Before**: `Promise.all` with per-ingredient queries for cost and stock.
**After**: Single batch query for all ingredients.

```typescript
// Resolve all ingredient costs in one query
const [rows] = await pool.execute<ItemCostRow[]>(
  `SELECT iv.item_id,
          COALESCE(SUM(iv.stock_quantity * iv.unit_cost), 0) AS total_value,
          COALESCE(SUM(iv.stock_quantity), 0) AS total_qty
   FROM inventory_transactions iv
   WHERE iv.company_id = ? AND iv.item_id IN (${ingredientIds.map(() => '?').join(',')})
   GROUP BY iv.item_id`,
  [companyId, ...ingredientIds]
);
```

### Key Takeaways

- **Batch first, optimize later**: Start with a batch query even if it returns more data than needed. Profile before denormalizing.
- **Kysely + raw SQL coexistence**: Epic 2 confirms the Epic 1 boundary. Use Kysely for CRUD/retrieval; preserve raw SQL for financial aggregations and complex joins.
- **Offline-first requires explicit outcomes**: Every sync transaction must have an explicit result (`OK`/`DUPLICATE`/`ERROR`). No silent failures.
- **Connection wrapper fixes**: When migrating Kysely with `mysql2/promise`, ensure the pool wrapper correctly forwards both `getConnection` callback and `query/execute` to the raw connection.

---

## Consequences

### Positive

- **Type-safe queries**: Column and table names are validated at compile time.
- **Explicit SQL**: Generated SQL is predictable — no ORM magic that hides query behavior.
- **Developer velocity**: CRUD operations are less verbose than raw SQL with `RowDataPacket` intersections.
- **N+1 control**: Developer explicitly writes JOINs — no lazy loading trap.
- **Pool reuse**: Kysely uses existing mysql2 pool singleton — no new connection overhead.
- **Incremental adoption**: Routes can be migrated one at a time.

### Negative / Trade-offs

- **N+1 still possible**: Kysely does not auto-prevent N+1 — developers must explicitly use JOINs.
- **Generated types drift**: `kysely-codegen` must be re-run after schema migrations to update types.
- **Learn curve**: Developers familiar with Prisma/Django ORM may expect auto-eager-loading.
- **Transaction syntax**: Kysely transactions use `startTransaction()`/`commitTransaction()`/`rollbackTransaction()` — different from mysql2's `beginTransaction()`.
- **Delete result**: Use `numDeletedRows` (bigint) not `numAffectedRows` — easy to miss.

---

## Sync Protocol Validation

For any sync-related changes, **always use the [Sync Protocol Validation Checklist](../../process/sync-protocol-checklist.md)** before implementation. This checklist is mandatory for:
- POS sync push/pull changes
- Offline-first behavior modifications
- Conflict resolution logic changes
- `client_tx_id` handling modifications

## References

- `packages/db/src/pool.ts` — Pool singleton, `createDbPool()`, `closeDbPool()`
- `packages/db/src/mysql-client.ts` — `DbConn` class
- `packages/db/src/connection-kysely.ts` — `newKyselyConnection()` helper
- `packages/db/src/kysely/schema.ts` — Generated types (96 tables, 1491 lines)
- `packages/db/src/kysely/schema-extended.ts` — Manual type extensions
- `packages/db/src/jurnapod-client.ts` — `JurnapodDbClient` interface
- `apps/api/src/lib/db.ts` — API entry point (thin wrapper)
- `apps/api/src/lib/taxes.ts` — Example migrated route (Kysely CRUD)
- `apps/api/src/lib/users.ts` — Example migrated route (Kysely CRUD)
- `packages/modules/accounting/src/journals-service.ts` — Journal batch/line pattern, preserve raw SQL for creation
- `packages/modules/accounting/src/account-types-service.ts` — Soft-delete pattern
- `packages/modules/accounting/src/accounts-service.ts` — Example migrated service
- `ADR-0007-mysql2-pool-singleton-raw-sql.md` — Raw SQL approach (still valid for complex queries)
- [Kysely Documentation](https://kysely.dev/)
- [Sync Protocol Validation Checklist](../../process/sync-protocol-checklist.md) — **Mandatory for sync changes**
- Epic 0: Kysely ORM Infrastructure (Stories 0.1.1–0.1.6)
- Epic 1: Continue Kysely Migration (Stories 1.1–1.3)
- Epic 2: Sync Routes & Reports Migration (Stories 2.1–2.10)
