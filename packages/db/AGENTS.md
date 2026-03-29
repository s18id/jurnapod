# AGENTS.md — @jurnapod/db

## Package Purpose

Database connectivity and schema management layer for Jurnapod ERP.
- **mysql2** for raw SQL and connection pooling
- **Kysely** for type-safe query building
- **Idempotent migrations** for schema evolution

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run db:migrate` | Run pending migrations (locking, idempotent) |
| `npm run db:smoke` | Run smoke tests against database |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Compile TypeScript to dist/ |

---

## Schema Change Workflow

### 1. Create Migration File

Naming convention: `{NNNN}_{descriptive_name}.sql`
- Sequential 4-digit prefix (e.g., `0129`, `0130`)
- Use snake_case description
- Place in `/migrations/` directory

### 2. Migration Content Rules

**MUST be idempotent** (rerunnable safely):

```sql
-- CORRECT: Idempotent column addition
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'accounts' 
    AND column_name = 'new_field'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE accounts ADD COLUMN new_field VARCHAR(255)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- CORRECT: Safe INSERT IGNORE for seed data
INSERT IGNORE INTO tax_rate_types (id, name) VALUES (1, 'VAT');
```

**AVOID** non-portable syntax:
```sql
-- WRONG: Not portable MySQL/MariaDB
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS new_field VARCHAR(255);
```

### 3. Test Migration

```bash
# Run migration
npm run db:migrate -w @jurnapod/db

# Verify (run again - should be no-op)
npm run db:migrate -w @jurnapod/db

# Run smoke tests
npm run db:smoke -w @jurnapod/db
```

### 4. Generate Kysely Types (if schema changed)

```bash
npm run db:generate:schema -w @jurnapod/db
```

This updates `src/kysely/schema.ts` with TypeScript types from live database.

---

## Database Client Usage

### Basic DbConn

```typescript
import { createDbPool, DbConn } from '@jurnapod/db';

const pool = createDbPool({
  uri: 'mysql://user:pass@localhost:3306/jurnapod?charset=utf8mb4&dateStrings=true',
  connectionLimit: 10
});

const db = new DbConn(pool);
```

### Raw SQL Queries

```typescript
// SELECT - returns typed rows
const rows = await db.query<RowDataPacket>(
  'SELECT * FROM accounts WHERE company_id = ? AND is_active = 1',
  [companyId]
);

// SELECT single row - returns one row or null
const account = await db.querySingle<RowDataPacket>(
  'SELECT * FROM accounts WHERE company_id = ? AND id = ?',
  [companyId, accountId]
);

// INSERT/UPDATE/DELETE - returns result with insertId/affectedRows
const result = await db.execute(
  'INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)',
  [companyId, code, name]
);
console.log(result.insertId);
```

### Kysely Type-Safe Queries

```typescript
import type { DB } from '@jurnapod/db';

// Select
const accounts = await db.kysely
  .selectFrom('accounts')
  .where('company_id', '=', companyId)
  .where('deleted_at', 'is', null)
  .select(['id', 'code', 'name'])
  .execute();

// Insert with returning
const newAccount = await db.kysely
  .insertInto('accounts')
  .values({ company_id: companyId, code, name, is_active: true })
  .returningAll()
  .executeTakeFirst();
```

### Transactions

```typescript
// Manual transaction
await db.begin();
try {
  await db.execute('INSERT INTO accounts ...', [...]);
  await db.execute('UPDATE companies SET ...', [...]);
  await db.commit();
} catch (error) {
  await db.rollback();
  throw error;
}

// Single query transaction helper
const result = await db.withTransaction(
  'INSERT INTO accounts (company_id, code, name) VALUES (?, ?, ?)',
  [companyId, code, name]
);

// Kysely transaction
const trx = await db.startTransaction().execute();
try {
  await trx.insertInto('journal_batches').values({ ... }).execute();
  await trx.commit().execute();
} catch (error) {
  await trx.rollback().execute();
}
```

---

## Critical Constraints

### Tenant Isolation

**ALWAYS** scope queries by `company_id`:

```typescript
// CORRECT
await db.query(
  'SELECT * FROM accounts WHERE company_id = ? AND id = ?',
  [companyId, accountId]
);

// WRONG - missing tenant scoping
await db.query('SELECT * FROM accounts WHERE id = ?', [accountId]);
```

### Money Handling

- **NEVER** use FLOAT/DOUBLE for money columns
- Use DECIMAL(19,4) for amounts
- Use BIGINT for raw cents (when applicable)

### Timestamp Conventions

- Unix milliseconds in BIGINT for canonical storage (`reservation_start_ts`, `reservation_end_ts`)
- Derive API-compatible DATETIME fields from unix timestamps
- Timezone resolution order: `outlet.timezone` → `company.timezone`

### Index Safety

**NEVER** wrap indexed columns in SQL functions:

```sql
-- WRONG: Prevents index usage
WHERE DATE(created_at) = '2024-01-01'

-- CORRECT: Function on constant
WHERE created_at >= '2024-01-01' AND created_at < '2024-01-02'
```

---

## File Organization

```
packages/db/
├── src/
│   ├── index.ts              # Main exports
│   ├── pool.ts               # Connection pool factory
│   ├── mysql-client.ts       # Raw SQL client (DbConn)
│   ├── jurnapod-client.ts    # Client interfaces
│   └── kysely/
│       ├── index.ts          # Kysely exports
│       ├── schema.ts         # Auto-generated types
│       └── schema-extended.ts # Manual type extensions
├── migrations/
│   ├── 0000_schema_migrations.sql
│   ├── 0001_companies.sql
│   └── ... (sequential .sql files)
├── scripts/
│   ├── migrate.mjs           # Migration runner
│   ├── seed.mjs              # Company seeding
│   ├── smoke.mjs             # Smoke tests
│   └── *.mjs                 # Utility scripts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Common Scripts Reference

| Script | Purpose |
|--------|---------|
| `db:migrate` | Run pending migrations with advisory locking |
| `db:seed` | Seed a new company with default data |
| `db:smoke` | Verify database connectivity and schema |
| `db:seed:test-items` | Generate random test items |
| `db:seed:test-accounts` | Generate random test accounts |
| `db:backfill:pos-journals` | Backfill POS journal entries |
| `db:reconcile:pos-journals` | Reconcile POS journal balances |
| `db:audit:system-roles` | Find duplicate system roles |
| `db:consolidate:system-roles` | Merge duplicate system roles |

---

## Review Checklist

When modifying this package:

- [ ] Migrations are idempotent (rerunnable)
- [ ] No FLOAT/DOUBLE for money columns
- [ ] Tenant scoping (`company_id`, `outlet_id`) in queries
- [ ] Index-safe query patterns (no functions on indexed columns)
- [ ] TypeScript types regenerated if schema changed
- [ ] Migration tested locally (run twice to verify idempotency)
- [ ] MySQL 8.0+ and MariaDB compatible syntax

---

## Related Packages

- `@jurnapod/api` — Uses this package for all database access
- `@jurnapod/shared` — Shared contracts, not database types

For project-wide conventions, see root `AGENTS.md`.
