# Epic 18: Pure Kysely Migration (Packages Only)

**Status:** Done
**Theme:** Database Access Modernization
**Started:** 2026-03-31
**Completion Date:** 2026-03-31

---

## Summary

Migrate all packages from mysql2-style database patterns (`DbConn` wrapper, `queryAll`, `execute`) to pure Kysely ORM API (`selectFrom`, `insertInto`, `updateTable`, `deleteFrom`, `transaction()`).

---

## Context

### Problem

Multiple packages still use mysql2-style database patterns:

1. **sync-core**: Data query files use `db.queryAll(sql, params)` pattern
2. **pos-sync**: Uses `db.queryAll`, `db.execute` 
3. **backoffice-sync**: Uses `db.queryAll`, `db.execute`
4. **modules/accounting**: Uses `.kysely` wrapper and mysql2 transactions
5. **modules/platform**: Uses `db.execute(sql, params)` pattern

These patterns are deprecated in favor of pure Kysely ORM API which provides:
- Type-safe query building
- Better SQL injection prevention
- Consistent API across all packages
- Easier testing and mocking

### Solution

Migrate all packages to use pure Kysely:

```typescript
// BEFORE (deprecated)
const rows = await db.queryAll('SELECT * FROM items WHERE company_id = ?', [companyId]);
await db.execute('INSERT INTO items (name) VALUES (?)', [name]);

// AFTER (pure Kysely)
const rows = await db.selectFrom('items').where('company_id', '=', companyId).execute();
await db.insertInto('items').values({ name }).execute();

// Transaction
await db.transaction().execute(async (trx) => {
  await trx.insertInto('items').values({ name }).execute();
});
```

---

## Goals

1. **Verify @jurnapod/db exports** - Confirm correct Kysely factory functions are exported
2. **Verify @jurnapod/auth pattern** - Document reference implementation for other packages
3. **Migrate sync-core** - Convert all data query files and jobs to pure Kysely
4. **Migrate pos-sync** - Convert push, pull, and data service to pure Kysely
5. **Migrate backoffice-sync** - Convert data service, batch processor, scheduler
6. **Migrate modules/accounting** - Remove `.kysely` wrapper, fix transactions
7. **Migrate modules/platform** - Convert execute() to sql template or query builder

---

## Stories

| Story | Title | Status | Est | Actual |
|-------|-------|--------|-----|--------|
| 18.1 | Verify @jurnapod/db Exports | backlog | - | - |
| 18.2 | Verify @jurnapod/auth Kysely Pattern | backlog | - | - |
| 18.3a | Migrate sync-core Data Queries (Part 1) | backlog | - | - |
| 18.3b | Migrate sync-core Data Queries (Part 2) + Jobs | backlog | - | - |
| 18.4 | Migrate pos-sync | backlog | - | - |
| 18.5 | Migrate backoffice-sync | backlog | - | - |
| 18.6 | Migrate modules-accounting | backlog | - | - |
| 18.7 | Migrate modules-platform | backlog | - | - |

---

## Migration Patterns

### Query Migration

```typescript
// mysql2-style → Pure Kysely

// SELECT all
db.queryAll('SELECT * FROM items WHERE company_id = ?', [companyId])
→ db.selectFrom('items').selectAll().where('company_id', '=', companyId).execute()

// SELECT with specific columns
db.queryAll('SELECT id, name FROM items WHERE company_id = ?', [companyId])
→ db.selectFrom('items').select(['id', 'name']).where('company_id', '=', companyId).execute()

// INSERT
db.execute('INSERT INTO items (name, company_id) VALUES (?, ?)', [name, companyId])
→ db.insertInto('items').values({ name, company_id: companyId }).execute()

// UPDATE
db.execute('UPDATE items SET name = ? WHERE id = ?', [name, id])
→ db.updateTable('items').set({ name }).where('id', '=', id).execute()

// DELETE
db.execute('DELETE FROM items WHERE id = ?', [id])
→ db.deleteFrom('items').where('id', '=', id).execute()
```

### Transaction Migration

```typescript
// BEFORE
await db.beginTransaction();
try {
  await db.execute('INSERT INTO orders ...', [...]);
  await db.commit();
} catch {
  await db.rollback();
}

// AFTER
await db.transaction().execute(async (trx) => {
  await trx.insertInto('orders').values({...}).execute();
});
```

### Wrapper Removal

```typescript
// BEFORE (unnecessary .kysely wrapper)
this.db.kysely.selectFrom('accounts')...

// AFTER (direct access)
this.db.selectFrom('accounts')...
```

---

## Dependencies

| Package | Depends On | Purpose |
|---------|-----------|---------|
| sync-core | @jurnapod/db | Database types and Kysely factory |
| pos-sync | sync-core | Uses sync-core data queries |
| backoffice-sync | sync-core | Uses sync-core data queries |
| modules/accounting | @jurnapod/db | Database types |
| modules/platform | @jurnapod/db | Database types |

---

## Success Criteria

- [ ] All packages use pure Kysely API (no `mysql2` imports for data access)
- [ ] No `DbConn` wrapper usage in any package
- [ ] No `queryAll(sql, params)` or `execute(sql, params)` patterns
- [ ] All transactions use `db.transaction().execute()`
- [ ] TypeScript typecheck passes for all packages
- [ ] Build passes for all packages
- [ ] AGENTS.md documentation reflects pure Kysely standard

---

## Key Deliverables

### Package Migration Status

| Package | Files | Status |
|---------|-------|--------|
| @jurnapod/db | index.ts, kysely/* | ✅ Already pure Kysely |
| @jurnapod/sync-core | data/*.ts, jobs/*.ts | 🔄 To migrate |
| @jurnapod/pos-sync | push, pull, core/* | 🔄 To migrate |
| @jurnapod/backoffice-sync | core, batch, scheduler/* | 🔄 To migrate |
| @jurnapod/modules/accounting | *-service.ts | 🔄 To migrate |
| @jurnapod/modules/platform | audit-service.ts | 🔄 To migrate |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking changes to dependent packages | Test after each story, verify typecheck |
| Transaction migration errors | Use `withTransaction()` helper from @jurnapod/db |
| Complex queries not fitting query builder | Use `sql` template tag from Kysely |

---

## Notes

Epic 18 covers packages only. Epic 19 will cover the API package migration.

---

## Retrospective

See: [Epic 18 Retrospective](./epic-18.retrospective.md)

---

*Epic started: 2026-03-31*
