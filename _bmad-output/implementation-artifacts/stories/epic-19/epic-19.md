# Epic 19: Pure Kysely Migration (API)

**Status:** In Progress
**Theme:** Database Access Modernization
**Started:** 2026-03-31
**Completion Date:** -

---

## Summary

Migrate the entire `apps/api` package from mysql2-style database patterns (`getDbPool`, `pool.execute`, `DbConn`) to pure Kysely ORM API (`selectFrom`, `insertInto`, `updateTable`, `deleteFrom`, `sql` template).

Epic 18 completed the packages migration. Epic 19 completes the API migration.

---

## Context

### Problem

The `apps/api` package still uses extensive mysql2-style patterns:

1. **Direct `getDbPool()` usage** - Creates callback-based mysql2 pools
2. **`pool.execute()` / `pool.query()`** - mysql2 promise API
3. **`DbConn` wrapper** - Legacy mysql2 wrapper being removed
4. **`RowDataPacket` type imports** - mysql2 specific types
5. **Manual transaction handling** - `beginTransaction/commit/rollback`

### Solution

Migrate all API database access to pure Kysely:

```typescript
// BEFORE (mysql2 style)
import { getDbPool } from "@/lib/db";
const pool = getDbPool();
const [rows] = await pool.execute<RowDataPacket[]>('SELECT * FROM items WHERE company_id = ?', [companyId]);

// AFTER (pure Kysely)
import { getKysely } from '@jurnapod/db';
const db = getKysely();
const rows = await db.selectFrom('items').where('company_id', '=', companyId).execute();
```

---

## Migration Patterns

### Import Changes

```typescript
// BEFORE
import { getDbPool, getDbConn } from "@/lib/db";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";

// AFTER
import { getKysely, type KyselySchema } from '@jurnapod/db';
import { sql } from 'kysely';
```

### Query Patterns

```typescript
// SELECT single row
pool.execute('SELECT * FROM items WHERE id = ?', [id])
→ db.selectFrom('items').where('id', '=', id).executeTakeFirst()

// SELECT multiple rows
pool.execute('SELECT * FROM items WHERE company_id = ?', [companyId])
→ db.selectFrom('items').where('company_id', '=', companyId).execute()

// INSERT
pool.execute('INSERT INTO items (name, company_id) VALUES (?, ?)', [name, companyId])
→ db.insertInto('items').values({ name, company_id: companyId }).execute()

// UPDATE
pool.execute('UPDATE items SET name = ? WHERE id = ?', [name, id])
→ db.updateTable('items').set({ name }).where('id', '=', id).execute()

// DELETE
pool.execute('DELETE FROM items WHERE id = ?', [id])
→ db.deleteFrom('items').where('id', '=', id).execute()
```

### Transaction Patterns

```typescript
// BEFORE
await connection.beginTransaction();
try {
  await connection.execute('INSERT...', [...]);
  await connection.commit();
} catch {
  await connection.rollback();
  throw;
}

// AFTER
await db.transaction().execute(async (trx) => {
  await trx.insertInto('items').values({...}).execute();
});
```

### Raw SQL with `sql` template

For complex queries that don't fit the query builder:

```typescript
// BEFORE
await pool.execute('SELECT * FROM items WHERE name LIKE ?', [`%${search}%`])

// AFTER
await sql`SELECT * FROM items WHERE name LIKE ${'%' + search + '%'}`.execute(db)
```

---

## Stories

| Story | Title | Status | Dependencies |
|-------|-------|--------|--------------|
| 19.1 | Migrate api/lib shared utilities | backlog | Epic 18 complete |
| 19.2 | Migrate api/lib foundation | backlog | 19.1 |
| 19.3 | Migrate api/lib items | backlog | 19.2 |
| 19.4 | Migrate api/lib business | backlog | 19.2 |
| 19.5 | Migrate api/lib accounting | backlog | 19.4 |
| 19.6 | Migrate api/lib operations | backlog | 19.4 |
| 19.7 | Migrate api/lib settings | backlog | 19.2 |
| 19.8 | Migrate api/lib email | backlog | 19.2 |
| 19.9 | Migrate api/lib fiscal | backlog | 19.5 |
| 19.10 | Migrate api/lib cost-recipe | backlog | 19.3 |
| 19.11 | Migrate api/lib reports | backlog | 19.6 |
| 19.12 | Migrate api/routes | backlog | 19.1-19.11 |
| 19.13 | Final verification | backlog | 19.1-19.12 |

---

## File Migration Map

### lib/shared
| File | Status | Notes |
|------|--------|-------|
| `shared/master-data-utils.ts` | 🔄 To migrate | Contains `withTransaction` |
| `shared/common-utils.ts` | 🔄 To migrate | Helper utilities |

### lib (Foundation)
| File | Status | Notes |
|------|--------|-------|
| `companies.ts` | 🔄 To migrate | ~1000 lines |
| `users.ts` | 🔄 To migrate | ~1500 lines |
| `outlets.ts` | 🔄 To migrate | ~500 lines |
| `db.ts` | 🔄 To migrate | Pool/Kysely initialization |

### lib (Items)
| File | Status | Notes |
|------|--------|-------|
| `items/index.ts` | 🔄 To migrate | Item CRUD |
| `items/prices.ts` | 🔄 To migrate | Price management |

### lib (Business)
| File | Status | Notes |
|------|--------|-------|
| `stock.ts` | 🔄 To migrate | Complex transactions, FOR UPDATE |
| `cogs-posting.ts` | 🔄 To migrate | Transactional posting |
| `cost-tracking.ts` | 🔄 To migrate | Cost calculation |
| `sync-push-posting.ts` | 🔄 To migrate | Sync hook |
| `outlet-tables.ts` | 🔄 To migrate | Table management |

### lib (Sync)
| File | Status | Notes |
|------|--------|-------|
| `sync/master-data.ts` | 🔄 To migrate | Master data queries |
| `sync/audit-adapter.ts` | 🔄 To migrate | Audit bridge |
| `sync/push/*` | 🔄 To migrate | Push sync logic |

### lib (Settings)
| File | Status | Notes |
|------|--------|-------|
| `taxes.ts` | 🔄 To migrate | Tax calculations |
| `feature-flags.ts` | 🔄 To migrate | Feature flags |

---

## Dependencies

### Migration Order (Critical)

```
19.1 (shared) 
    ↓
19.2 (foundation: companies, users, outlets)
    ↓
19.3 (items)     19.4 (business: stock, cogs, cost-tracking)
    ↓                ↓
19.5 (accounting)   19.6 (operations)
    ↓                ↓
19.9 (fiscal)       19.11 (reports)
    ↓
19.7 (settings)  19.8 (email)  19.10 (cost-recipe)
    ↓
19.12 (routes)
    ↓
19.13 (verification)
```

### Package Dependencies

| Package | Depends On | Purpose |
|---------|-----------|---------|
| apps/api | @jurnapod/db | Kysely factory functions |
| apps/api | @jurnapod/shared | Zod schemas |
| apps/api | @jurnapod/sync-core | Sync infrastructure (migrated in Epic 18) |

---

## Success Criteria

- [ ] All API lib files use pure Kysely
- [ ] No `getDbPool` imports in API code
- [ ] No `RowDataPacket` / `ResultSetHeader` mysql2 types
- [ ] No `pool.execute()` / `pool.query()` calls
- [ ] No manual `beginTransaction/commit/rollback`
- [ ] All routes use library-first pattern
- [ ] TypeScript typecheck passes for `@jurnapod/api`
- [ ] Build passes for `@jurnapod/api`
- [ ] Critical path tests pass

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking changes to routes | Use library-first pattern; routes delegate to lib |
| Complex transactions (FOR UPDATE) | Use `db.transaction().execute()` with proper locking |
| Large number of files (20+) | Break into stories by module dependency order |
| Test breakage | Run `test:unit:critical` after each story |

---

## Epic 18 Follow-up

Epic 18 migrated packages but left API with ~150+ type errors. This epic resolves those errors by completing the migration.

### API Files with Epic 18 Breakage

| File | Epic 18 Issue |
|------|---------------|
| `lib/db.ts` | `DbConn` removed from exports |
| `lib/companies.ts` | Uses `DbConn` |
| `lib/users.ts` | Uses `DbConn` |
| `lib/outlets.ts` | Uses `DbConn` |
| `lib/items/index.ts` | Uses `getDbPool` |
| `lib/sync/*` | Various mysql2 patterns |

---

## Notes

Epic 19 is the final step in the Pure Kysely migration that started with Epic 1 (Kysely setup) and continued through multiple epics.

---

## Retrospective

See: [Epic 19 Retrospective](./epic-19.retrospective.md)

---

*Epic started: 2026-03-31*
