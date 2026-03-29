# Database Operations (`@jurnapod/db`)

This package provides database connectivity using **mysql2** (callback-based) with **Kysely** for type-safe queries.

## Package Exports

```typescript
import { 
  // Pool management
  createDbPool,
  
  // Unified client (Kysely + raw SQL)
  DbConn,
  
  // Kysely bound to existing connection (for advanced transactions)
  newKyselyConnection,
  
  // Type exports
  type DB,
  type JurnapodDbClient,
  type SqlExecuteResult
} from '@jurnapod/db';
```

## Quick Reference

| Command | Description |
|---------|-------------|
| `npm run db:migrate` | Run pending migrations |
| `npm run db:seed` | Seed a new company |
| `npm run db:smoke` | Run smoke tests |
| `npm run db:generate:schema` | Generate Kysely schema from database |

## DbConn Usage

```typescript
import { createDbPool, DbConn } from '@jurnapod/db';

const pool = createDbPool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'password',
  database: 'jurnapod',
  connectionLimit: 10
});

const db = new DbConn(pool);
```

Or with URI (recommended):

```typescript
const pool = createDbPool({
  uri: 'mysql://root:password@localhost:3306/jurnapod?charset=utf8mb4&dateStrings=true',
  connectionLimit: 10
});
```

## Raw SQL Queries

```typescript
// SELECT - returns rows
const rows = await db.query<RowDataPacket>(
  'SELECT * FROM accounts WHERE company_id = ? AND is_active = 1',
  [companyId]
);

// INSERT/UPDATE/DELETE - returns affectedRows and insertId
const result = await db.execute(
  'INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)',
  [companyId, code, name]
);
console.log(result.insertId);
```

## Kysely Queries (Type-Safe)

```typescript
// Type-safe select
const accounts = await db.kysely
  .selectFrom('accounts')
  .where('company_id', '=', companyId)
  .where('deleted_at', 'is', null)
  .select(['id', 'code', 'name'])
  .execute();

// Type-safe insert
const newAccount = await db.kysely
  .insertInto('accounts')
  .values({
    company_id: companyId,
    code,
    name,
    account_type_id,
    is_active: true,
    created_at: new Date()
  })
  .returningAll()
  .executeTakeFirst();
```

## Transactions

### Manual Transaction (begin/commit/rollback)

```typescript
await db.begin();
try {
  await db.execute('INSERT INTO accounts ...', [...]);
  await db.execute('UPDATE companies SET ...', [...]);
  await db.commit();
} catch (error) {
  await db.rollback();
  throw error;
}
```

### Single Query Transaction

For operations that only need one query within a transaction:

```typescript
// Automatically handles begin/commit/rollback
const result = await db.withTransaction(
  'INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)',
  [companyId, code, name]
);
```

### Kysely with startTransaction()

```typescript
const trx = await db.startTransaction().execute();
try {
  await trx.insertInto('journal_batches').values({ ... }).execute();
  await trx.commit().execute();
} catch (error) {
  await trx.rollback().execute();
}
```

## Schema Generation

Generate TypeScript types from the database:

```bash
npm run db:generate:schema -w @jurnapod/db
```

This runs `kysely-codegen` and replaces `src/kysely/schema.ts` with type definitions derived from the live database.

## Migration Guidelines

- All migrations must be idempotent (rerunnable)
- Use `INSERT IGNORE` for additive changes
- Avoid destructive operations unless clearly documented
- Test migrations on a staging environment first

## System Role Duplicate Audit

Over time, duplicate system role rows may accumulate. Run:

```bash
npm run db:audit:system-roles
```

To consolidate duplicates:

```bash
npm run db:consolidate:system-roles -- --apply
```
