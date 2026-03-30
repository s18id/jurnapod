# Database Operations (`@jurnapod/db`)

This package provides database connectivity using **Kysely** for type-safe queries with mysql2 driver.

## Package Exports

```typescript
import { 
  // Core Kysely
  Kysely,
  sql,
  
  // Types
  type Transaction,
  type Sql,
  type DatabaseSchema,
  type DbPoolConfig,
  
  // Factory functions
  createKysely,
  getKysely
} from '@jurnapod/db';
```

## Quick Reference

| Command | Description |
|---------|-------------|
| `npm run db:migrate` | Run pending migrations |
| `npm run db:seed` | Seed a new company |
| `npm run db:smoke` | Run smoke tests |
| `npm run db:generate:schema` | Generate Kysely schema from database |

## Usage Patterns

### Create Fresh Instance (Tests)

```typescript
import { createKysely } from '@jurnapod/db';

const db = createKysely({ uri: 'mysql://...' });

// ... use db ...
await db.destroy();
```

### Singleton (API Server)

```typescript
import { getKysely } from '@jurnapod/db';

// Returns singleton instance
const db = getKysely({ uri: 'mysql://...' });
```

### Type-Safe Query

```typescript
const items = await db
  .selectFrom('items')
  .where('company_id', '=', companyId)
  .selectAll()
  .execute();
```

### Transaction with Automatic Rollback

```typescript
await db.transaction().execute(async (trx) => {
  await trx.insertInto('items').values({...}).execute();
  // Throw error to trigger rollback
});
```

### Raw SQL Escape Hatch

```typescript
import { sql } from 'kysely';

const result = await sql`SELECT * FROM items WHERE id = ${id}`.execute(db);
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
