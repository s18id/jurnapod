# Story 18.3a: Migrate sync-core Data Queries (Part 1)

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - Packages

---

## Story

As a developer,
I want `sync-core` data queries to use pure Kysely API,
so that the package no longer uses mysql2-style `queryAll` patterns.

## Context

sync-core data query files currently use `db.queryAll(sql, params)` which is a mysql2-style pattern. This needs to be migrated to Kysely's `db.selectFrom().where().execute()` pattern.

## Acceptance Criteria

1. **Migrate item-queries.ts** (AC-1)
   - Convert `db.queryAll(sql, params)` → `db.selectFrom().where().execute()`

2. **Migrate variant-queries.ts** (AC-2)
   - Same pattern conversion

3. **Migrate tax-queries.ts** (AC-3)
   - Same pattern conversion

4. **Migrate table-queries.ts** (AC-4)
   - Same pattern conversion

5. **Migrate user-queries.ts** (AC-5)
   - Same pattern conversion

6. **Typecheck passes** (AC-6)
   - `npm run typecheck -w @jurnapod/sync-core`

## Tasks

- [ ] Task 1: Migrate item-queries.ts
- [ ] Task 2: Migrate variant-queries.ts
- [ ] Task 3: Migrate tax-queries.ts
- [ ] Task 4: Migrate table-queries.ts
- [ ] Task 5: Migrate user-queries.ts
- [ ] Task 6: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `packages/sync-core/src/data/item-queries.ts` | queryAll → selectFrom |
| `packages/sync-core/src/data/variant-queries.ts` | queryAll → selectFrom |
| `packages/sync-core/src/data/tax-queries.ts` | queryAll → selectFrom |
| `packages/sync-core/src/data/table-queries.ts` | queryAll → selectFrom |
| `packages/sync-core/src/data/user-queries.ts` | queryAll → selectFrom |

## Pattern Conversion

```typescript
// BEFORE (mysql2 style)
const rows = await db.queryAll<RowDataPacket>(
  'SELECT id, name FROM items WHERE company_id = ?',
  [companyId]
);

// AFTER (pure Kysely)
const rows = await db
  .selectFrom('items')
  .select(['id', 'name'])
  .where('company_id', '=', companyId)
  .execute();
```

## Dev Notes

### Dependencies
- Story 18.1 (verify db exports) should be complete first
- Uses `KyselySchema` type from `@jurnapod/db`

### Testing
- `npm run typecheck -w @jurnapod/sync-core`
- `npm run build -w @jurnapod/sync-core`

## Definition of Done

- [ ] All 5 files migrated to pure Kysely
- [ ] No `queryAll` calls remain
- [ ] Typecheck passes
- [ ] Build passes

## References

- [sync-core AGENTS.md]
- [Epic 18: Pure Kysely Migration]

---

## Dev Agent Record

<!-- To be filled by dev agent -->
