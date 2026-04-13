# AGENTS.md — @jurnapod/db

## Package Purpose

Database connectivity and schema management layer for Jurnapod ERP.
- **Kysely** for type-safe query building
- **mysql2** as the underlying driver
- **Idempotent migrations** for schema evolution

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run db:migrate` | Run pending migrations (locking, idempotent) |
| `npm run db:seed` | Restore canonical seeded roles and baseline data |
| `npm run db:seed:test-accounts` | Seed test accounts for integration readiness |
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

### Package Exports

`DB` is an alias for `DatabaseSchema` — the Kysely type parameter holding all table definitions.

```typescript
import { 
  Kysely,
  sql,
  type Transaction,
  type Sql,
  type DatabaseSchema, // <-- DB is an alias for this
  type DbPoolConfig,
  createKysely,
  getKysely
} from '@jurnapod/db';
```

### Create Fresh Instance (Tests)

```typescript
import { createKysely } from '@jurnapod/db';

const db = createKysely({ uri: 'mysql://...' });

// ... use db ...
await db.destroy();
```

### Singleton Pattern (API Server)

```typescript
import { getKysely } from '@jurnapod/db';

// Returns singleton instance
const db = getKysely({ uri: 'mysql://...' });
```

### Type-Safe Queries

```typescript
// Select all matching rows
const accounts = await db
  .selectFrom('accounts')
  .where('company_id', '=', companyId)
  .where('deleted_at', 'is', null)
  .select(['id', 'code', 'name'])
  .execute();

// Insert with returning
const newAccount = await db
  .insertInto('accounts')
  .values({ company_id: companyId, code, name, is_active: true })
  .returningAll()
  .executeTakeFirst();

// Update with returning
const updated = await db
  .updateTable('accounts')
  .set({ name: newName })
  .where('id', '=', accountId)
  .returningAll()
  .executeTakeFirst();

// Delete
await db
  .deleteFrom('accounts')
  .where('id', '=', accountId)
  .execute();
```

### Transactions

```typescript
// Transaction with automatic rollback on error
await db.transaction().execute(async (trx) => {
  await trx.insertInto('items').values({...}).execute();
  await trx.updateTable('inventory').set({...}).where(...).execute();
  // Throw to trigger automatic rollback
});
```

### Raw SQL Escape Hatch

```typescript
import { sql } from 'kysely';

// Parameterized raw SQL
const result = await sql`SELECT * FROM items WHERE id = ${itemId}`.execute(db);

// Complex queries
const complex = await sql`
  SELECT a.*, b.name as category_name 
  FROM items a 
  LEFT JOIN categories b ON a.category_id = b.id 
  WHERE a.company_id = ${companyId}
`.execute(db);
```

---

## Critical Constraints

### ACL Baseline Protection (P0)

Canonical ACL rows for system roles are shared reference data. Test cleanup must never wipe them globally.

- ❌ **BLOCKER**: Any `module_roles` cleanup by `role_id` alone
- ✅ **Required**: Scope ACL cleanup by `company_id` and `role_id` (or exact inserted row IDs)
- ✅ **Required**: Use custom test roles for mutation-heavy ACL tests

If ACL baseline is corrupted, recover with:

```bash
npm run db:migrate -w @jurnapod/db
npm run db:seed -w @jurnapod/db
npm run db:seed:test-accounts -w @jurnapod/db
```

### Tenant Isolation

**ALWAYS** scope queries by `company_id`:

```typescript
// CORRECT
const account = await db
  .selectFrom('accounts')
  .where('company_id', '=', companyId)
  .where('id', '=', accountId)
  .executeTakeFirst();

// WRONG - missing tenant scoping
const account = await db
  .selectFrom('accounts')
  .where('id', '=', accountId)
  .executeTakeFirst();
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
│   ├── index.ts              # Main exports (Kysely API)
│   ├── pool.ts               # Connection pool configuration
│   └── kysely/
│       ├── index.ts          # Kysely factory functions
│       ├── schema.ts         # Auto-generated types
│       ├── schema-extended.ts # Manual type extensions
│       └── transaction.ts     # Transaction helpers
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
- [ ] Use `createKysely` for tests, `getKysely` for server singletons
- [ ] Prefer type-safe Kysely queries over raw SQL
- [ ] Use `sql` template tag for raw SQL escape hatch

---

## Database Testing Policy (MANDATORY)

**NO MOCK DB for DB-backed business logic tests.** Use real DB integration via `.env`.

Any DB mock found in DB-backed tests is a P0 risk and must be treated as a blocker.

DB-backed tests (tests that exercise database queries, transactions, or constraints) MUST use real database connections:

```typescript
// Load .env before other imports
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env') });

import { createKysely, type KyselySchema } from '@jurnapod/db';

const db = createKysely({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// CRITICAL: Clean up in afterAll
afterAll(async () => {
  await db.destroy();
});
```

**Why no mocks for DB-backed tests?**
- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks don't reveal transaction isolation issues
- Integration with real DB catches performance problems early

**What to mock instead:**
- External HTTP services
- Message queues
- File system operations
- Time (use `vi.useFakeTimers()`)

**Non-DB logic (pure computation) may use unit tests without database.**

### ACL Cleanup Policy (P0 Blocker)

**Canonical system roles are immutable reference data in persistent test DBs.** Deleting or modifying `module_roles` rows for system roles (`SUPER_ADMIN`, `OWNER`, `COMPANY_ADMIN`, `ADMIN`, `ACCOUNTANT`, `CASHIER`) with `company_id=NULL` corrupts the seeded ACL baseline and breaks all subsequent tests.

**P0 Rules:**
- ❌ **BLOCKER**: Any cleanup/deletion by `role_id` alone on `module_roles` — this wipes canonical rows shared across all companies
- ✅ **Required**: ACL cleanup must scope by `company_id` AND `role_id` (e.g., `WHERE company_id = ? AND role_id IN (?)`)
- ✅ **Required**: Integration tests should mutate **custom test roles**, not seeded system roles
- ✅ **Required**: Use exact inserted row IDs when cleanup scope is ambiguous

**Recovery commands for corrupted ACL:**
```bash
npm run db:migrate -w @jurnapod/db
npm run db:seed -w @jurnapod/db
npm run db:seed:test-accounts -w @jurnapod/db
```

---

## Related Packages

- `@jurnapod/api` — Uses this package for all database access
- `@jurnapod/shared` — Shared contracts, not database types

For project-wide conventions, see root `AGENTS.md`.
