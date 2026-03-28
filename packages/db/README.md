# Database Operations

This directory contains scripts for database management, seeding, and maintenance.

## Package Exports

This package (`@jurnapod/db`) provides:

- **Kysely type-safe query builder** - For CRUD operations and simple queries
- **Raw SQL helpers** - For complex financial queries and aggregations
- **Connection utilities** - Pool management and transaction helpers

### Key Exports

```typescript
import { 
  // Pool management
  createDbPool,
  closeDbPool,
  
  // Unified client (Kysely + raw SQL)
  DbConn,
  
  // Transaction-bound Kysely helper
  newKyselyConnection,
  
  // Type exports
  type DB
} from '@jurnapod/db';
```

## Quick Reference

| Command | Description |
|---------|-------------|
| `npm run db:migrate` | Run pending migrations |
| `npm run db:seed` | Seed a new company |
| `npm run db:smoke` | Run smoke tests |
| `npm run db:audit:system-roles` | Audit for duplicate system roles |
| `npm run db:consolidate:system-roles` | Dry-run duplicate system-role consolidation |

## Kysely Usage Patterns

### Basic Kysely Query

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

### Transaction with newKyselyConnection

For transactions, use mysql2 native transaction control with `newKyselyConnection`:

```typescript
import { getDbPool } from '@/lib/db';  // API pool singleton
import { newKyselyConnection } from '@jurnapod/db';

const pool = getDbPool();
const connection = await pool.getConnection();

try {
  await connection.beginTransaction();

  // Create Kysely bound to this connection
  const kysely = newKyselyConnection(connection);

  // Use Kysely for type-safe CRUD within transaction
  await kysely.insertInto('journal_batches').values({ ... }).execute();
  await kysely.insertInto('journal_lines').values({ ... }).execute();

  // Use raw SQL for complex financial logic
  // await connection.execute('SELECT ... FOR UPDATE', [...]);

  await connection.commit();
} catch (err) {
  await connection.rollback();
  throw err;
} finally {
  connection.release();
}
```

### ConnectionAuditDbClient Pattern

For services that need both Kysely and raw SQL within transactions, use a wrapper:

```typescript
import type { PoolConnection } from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { newKyselyConnection } from '@jurnapod/db';

class ConnectionDbClient {
  constructor(private readonly connection: PoolConnection) {}

  get kysely() {
    return newKyselyConnection(this.connection);
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const [rows] = await this.connection.execute<RowDataPacket[]>(sql, params);
    return rows as T[];
  }

  async execute(sql: string, params?: any[]): Promise<{ affectedRows: number; insertId?: number }> {
    const [result] = await this.connection.execute<ResultSetHeader>(sql, params);
    return { affectedRows: result.affectedRows, insertId: result.insertId };
  }
}
```

### When to Use Raw SQL

**Use raw SQL for:**
- Financial aggregations (SUM, GROUP BY, complex JOINs)
- Report queries requiring SQL readability
- Complex upsert logic with conflict resolution
- Queries that benefit from SQL reviewability

**Use Kysely for:**
- Simple CRUD operations
- Type-safe column/table access
- Count/check queries
- Dynamic filter building

## System Role Duplicate Audit

Over time, duplicate system role rows may accumulate due to bugs or historical data issues. This can cause ambiguity in role lookups.

### Running the Audit

```bash
npm run db:audit:system-roles
```

Expected output when healthy:
```
=== System Role Duplicate Audit ===

PASS: No duplicate system roles found.

System roles are unique per code - audit passed.
```

If duplicates are found, the audit will exit with code 1 and show:
- Which role codes have duplicates
- The role IDs involved
- References in `module_roles` and `user_role_assignments`

### Consolidating Duplicates

When duplicates are detected, you can consolidate them using the consolidation tool.

**Dry run first (recommended):**
```bash
npm run db:consolidate:system-roles
```

**Apply changes:**
```bash
npm run db:consolidate:system-roles -- --apply
```

(Equivalent direct path from repo root:)
```bash
node packages/db/scripts/consolidate-system-role-duplicates.mjs
node packages/db/scripts/consolidate-system-role-duplicates.mjs --apply
```

The consolidation tool:
1. Keeps the canonical role (lowest ID)
2. Migrates all `module_roles` references to the canonical role
3. Migrates all `user_role_assignments` references
4. Deletes duplicate role rows

**Warning:** Always run a database backup before applying consolidation in production.

## Migration Guidelines

- All migrations must be idempotent (rerunnable)
- Use `INSERT IGNORE` for additive changes
- Avoid destructive operations unless clearly documented
- Test migrations on a staging environment first
