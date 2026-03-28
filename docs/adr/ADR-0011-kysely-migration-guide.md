<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# ADR-0011: Kysely Migration Guide for Epic 14

**Status:** Accepted
**Date:** 2026-03-28
**Deciders:** Ahmad Faruk (Signal18 ID)

---

## Context

Epic 14 continues the Kysely ORM migration from Epic 1-13. This guide consolidates patterns established across previous epics and provides specific guidance for Epic 14 migration work.

**Prerequisite reading:** [ADR-0009](./ADR-0009-kysely-type-safe-query-builder.md) for the foundational Kysely decision and architecture.

---

## Migration Patterns Summary

### Pattern 1: Basic Kysely Query (No Transaction)

For read-only or single-operation writes:

```typescript
import { createDbPool, DbConn } from '@jurnapod/db';

const pool = createDbPool(config);
const db = new DbConn(pool);

// Select
const rows = await db.kysely
  .selectFrom('table_name')
  .where('company_id', '=', companyId)
  .where('deleted_at', 'is', null)
  .select(['id', 'name'])
  .execute();

// Insert
const result = await db.kysely
  .insertInto('table_name')
  .values({ company_id: companyId, name, created_at: new Date() })
  .returningAll()
  .executeTakeFirst();

// Update - check numUpdatedRows (bigint)
const updateResult = await db.kysely
  .updateTable('table_name')
  .set({ name, updated_at: new Date() })
  .where('id', '=', id)
  .where('company_id', '=', companyId)
  .executeTakeFirst();
const affected = Number(updateResult?.numUpdatedRows ?? 0);

// Delete - check numDeletedRows (bigint), NOT numAffectedRows
const deleteResult = await db.kysely
  .deleteFrom('table_name')
  .where('id', '=', id)
  .where('company_id', '=', companyId)
  .executeTakeFirst();
const deleted = Number(deleteResult?.numDeletedRows ?? 0);
```

### Pattern 2: Transaction with `newKyselyConnection`

For multi-statement operations requiring atomicity:

```typescript
import { getDbPool } from '@/lib/db';
import { newKyselyConnection } from '@jurnapod/db';

const pool = getDbPool();
const connection = await pool.getConnection();

try {
  await connection.beginTransaction();
  
  // Kysely bound to connection for type-safe queries
  const kysely = newKyselyConnection(connection);
  
  // Operations using kysely
  await kysely.updateTable('accounts')
    .set({ balance: newBalance, updated_at: new Date() })
    .where('id', '=', accountId)
    .where('company_id', '=', companyId)
    .executeTakeFirst();
  
  // Raw SQL for complex logic
  await connection.execute(
    'INSERT INTO audit_logs (company_id, action, entity_id) VALUES (?, ?, ?)',
    [companyId, 'BALANCE_UPDATE', accountId]
  );
  
  await connection.commit();
} catch (err) {
  await connection.rollback();
  throw err;
} finally {
  connection.release();
}
```

### Pattern 3: ConnectionDbClient Wrapper

For services that mix Kysely and raw SQL extensively:

```typescript
class MyServiceDbClient {
  constructor(private readonly connection: PoolConnection) {}

  get kysely() {
    return newKyselyConnection(this.connection);
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const [rows] = await this.connection.execute<RowDataPacket[]>(sql, params);
    return rows as T[];
  }

  async execute(sql: string, params?: any[]): Promise<SqlExecuteResult> {
    const [result] = await this.connection.execute<ResultSetHeader>(sql, params);
    return { affectedRows: result.affectedRows, insertId: result.insertId };
  }
}

// Usage in service
export async function myServiceMethod(connection: PoolConnection) {
  const db = new MyServiceDbClient(connection);
  
  // Use kysely for simple ops
  const item = await db.kysely
    .selectFrom('items')
    .where('id', '=', itemId)
    .selectAll()
    .executeTakeFirst();
  
  // Use raw SQL for complex logic
  const complexResult = await db.query<ComplexRow[]>(`
    SELECT ... complex join ...
  `, [param1, param2]);
}
```

---

## Kysely API Reference

### Select Patterns

```typescript
// Simple select with filtering
const rows = await db.kysely
  .selectFrom('table')
  .where('company_id', '=', companyId)
  .select(['id', 'name'])
  .execute();

// Select with null check
.where('deleted_at', 'is', null)
.where('end_date', 'is not', null)

// Count query
const result = await db.kysely
  .selectFrom('accounts')
  .where('company_id', '=', companyId)
  .select(eb => eb.fn.count('id').as('count'))
  .executeTakeFirst();
const count = Number(result?.count ?? 0);

// Select with join
const rows = await db.kysely
  .selectFrom('orders')
  .innerJoin('customers', 'orders.customer_id', 'customers.id')
  .where('orders.company_id', '=', companyId)
  .select(['orders.id', 'orders.total', 'customers.name'])
  .execute();

// Select with whereIn
const rows = await db.kysely
  .selectFrom('items')
  .where('id', 'in', itemIds)
  .selectAll()
  .execute();

// Select with order and limit
const rows = await db.kysely
  .selectFrom('transactions')
  .where('company_id', '=', companyId)
  .orderBy('created_at', 'desc')
  .limit(100)
  .selectAll()
  .execute();
```

### Insert Patterns

```typescript
// Insert single row with returning
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

// Insert multiple rows
await db.kysely
  .insertInto('items')
  .values(items.map(item => ({
    company_id: companyId,
    name: item.name,
    created_at: new Date()
  })))
  .execute();
```

### Update Patterns

```typescript
// Update with where
const result = await db.kysely
  .updateTable('items')
  .set({ name, updated_at: new Date() })
  .where('id', '=', itemId)
  .where('company_id', '=', companyId)
  .executeTakeFirst();

// Check affected rows (bigint → number)
const affected = Number(result?.numUpdatedRows ?? 0);
if (affected === 0) {
  throw new NotFoundError();
}
```

### Delete Patterns

```typescript
// Soft delete (preferred for financial data)
await db.kysely
  .updateTable('items')
  .set({ deleted_at: new Date() })
  .where('id', '=', itemId)
  .where('company_id', '=', companyId)
  .execute();

// Hard delete (use with caution)
const result = await db.kysely
  .deleteFrom('temp_import_rows')
  .where('import_id', '=', importId)
  .executeTakeFirst();

const deleted = Number(result?.numDeletedRows ?? 0);
```

---

## N+1 Prevention

Kysely does NOT auto-prevent N+1. Always batch fetch related data:

```typescript
// BAD: N+1
for (const order of orders) {
  const customer = await db.kysely
    .selectFrom('customers')
    .where('id', '=', order.customer_id)
    .executeTakeFirst();
}

// GOOD: Batch fetch
const customerIds = [...new Set(orders.map(o => o.customer_id))];
const customers = await db.kysely
  .selectFrom('customers')
  .where('id', 'in', customerIds)
  .selectAll()
  .execute();
const customerMap = new Map(customers.map(c => [c.id, c]));

// In memory join
for (const order of orders) {
  const customer = customerMap.get(order.customer_id);
}
```

---

## When to Preserve Raw SQL

### Keep Raw SQL For:

1. **Financial aggregations**
```typescript
const glSql = `
  SELECT a.id, a.code, a.name,
    SUM(jl.debit) AS total_debit,
    SUM(jl.credit) AS total_credit,
    SUM(jl.debit) - SUM(jl.credit) AS balance
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
  LEFT JOIN journal_batches jb ON jb.id = jl.journal_batch_id
  WHERE a.company_id = ?
    AND a.deleted_at IS NULL
  GROUP BY a.id, a.code, a.name
  ORDER BY a.code
`;
```

2. **Complex JOINs with business logic**
```typescript
const sql = `
  SELECT o.*, 
    COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS order_total
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id
  WHERE o.company_id = ? AND o.deleted_at IS NULL
  GROUP BY o.id
`;
```

3. **Idempotency checks with IN clause**
```typescript
const existing = await db.kysely
  .selectFrom('pos_transactions')
  .where('client_tx_id', 'in', clientTxIds)
  .select(['client_tx_id'])
  .execute();
```

---

## Common Mistakes to Avoid

### Mistake 1: Using `numAffectedRows` for Delete

```typescript
// WRONG
const result = await db.kysely.deleteFrom('items').where(...).execute();
const affected = result.numAffectedRows; // undefined!

// CORRECT
const result = await db.kysely.deleteFrom('items').where(...).execute();
const deleted = Number(result.numDeletedRows ?? 0); // bigint!
```

### Mistake 2: Missing `company_id` Scoping

```typescript
// WRONG - Missing tenant isolation
const items = await db.kysely
  .selectFrom('items')
  .where('id', '=', itemId)
  .selectAll()
  .execute();

// CORRECT - Always scope to company
const items = await db.kysely
  .selectFrom('items')
  .where('id', '=', itemId)
  .where('company_id', '=', companyId) // Always include!
  .selectAll()
  .execute();
```

### Mistake 3: N+1 in Loops

Always batch fetch related entities (see N+1 Prevention section).

### Mistake 4: Forgetting `.executeTakeFirst()` for Single Row

```typescript
// WRONG - Returns array
const item = await db.kysely
  .selectFrom('items')
  .where('id', '=', itemId)
  .selectAll()
  .execute(); // Returns Item[]

// CORRECT - Returns single row or undefined
const item = await db.kysely
  .selectFrom('items')
  .where('id', '=', itemId)
  .selectAll()
  .executeTakeFirst(); // Returns Item | undefined
```

### Mistake 5: Not Converting BigInt

Kysely returns bigint for row counts. Always convert:

```typescript
const result = await db.kysely.updateTable('items').set({...}).where(...).execute();
const updated = Number(result.numUpdatedRows ?? 0n); // Convert bigint to number
```

---

## Batch Operations Pattern (Epic 14)

For batch UPDATE/INSERT in MySQL with Kysely:

### UPDATE Loop

```typescript
for (const item of updates) {
  await kysely
    .updateTable('items')
    .set({
      sku: item.sku,
      name: item.name,
      item_type: item.itemType
    })
    .where('id', '=', item.id)
    .execute();
}
```

### INSERT Loop

```typescript
for (const item of inserts) {
  await kysely
    .insertInto('items')
    .values({
      company_id: companyId,
      sku: item.sku,
      name: item.name
    })
    .execute();
}
```

**Note:** Kysely's batch operations are PostgreSQL-optimized. For MySQL, loop-based approach with individual statements is acceptable.

## Bitwise Permission Check Pattern (Epic 14)

For complex JOINs with bitwise operations:

```typescript
import { sql } from 'kysely';

const row = await db
  .selectFrom('user_role_assignments as ura')
  .innerJoin('roles as r', 'r.id', 'ura.role_id')
  .innerJoin('module_roles as mr', 'mr.role_id', 'r.id')
  .where(sql`(${sql`mr.permission_mask`} & ${sql`${permissionBit}`})`, '<>', 0)
  .executeTakeFirst();
```

## Epic 14 Migration Checklist

- [ ] Replace direct `pool.execute()` calls with `DbConn` wrapper
- [ ] Use `newKyselyConnection(connection)` for transactions
- [ ] Add `company_id` scoping to all queries
- [ ] Replace `numAffectedRows` with `numUpdatedRows`/`numDeletedRows`
- [ ] Convert bigint results with `Number()` or `BigInt()`
- [ ] Add N+1 batch fetching for related entities
- [ ] Preserve raw SQL for financial aggregations
- [ ] Update unit tests to close database pools
- [ ] Run `npm run typecheck -w @jurnapod/api` after changes
- [ ] Run `npm run test:unit -w @jurnapod/api` to verify

---

## References

- [ADR-0009](./ADR-0009-kysely-type-safe-query-builder.md) - Foundational Kysely decision
- `packages/db/src/connection-kysely.ts` - `newKyselyConnection()` implementation
- `packages/db/src/mysql-client.ts` - `DbConn` class
- `packages/db/src/kysely/schema.ts` - Generated Kysely types (DB interface)
- `apps/api/src/lib/db.ts` - API pool singleton
- `apps/api/src/lib/outlets.ts` - Example service with `ConnectionDbClient` pattern
- [Kysely Documentation](https://kysely.dev/)
