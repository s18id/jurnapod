# Story 18.4: Migrate pos-sync to Pure Kysely

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - Packages

---

## Story

As a developer,
I want `pos-sync` to use pure Kysely API for all database operations,
so that the package fully migrates from mysql2-style patterns.

## Context

pos-sync package uses mysql2-style patterns like `db.queryAll()` and `db.execute()`. This needs to be migrated to Kysely.

## Acceptance Criteria

1. **Migrate push/index.ts** (AC-1)
   - Convert `db.queryAll`, `db.execute` → Kysely

2. **Migrate pull/index.ts** (AC-2)
   - Same pattern conversion

3. **Migrate core/pos-data-service.ts** (AC-3)
   - Same pattern conversion

4. **Typecheck passes** (AC-4)
   - `npm run typecheck -w @jurnapod/pos-sync`

## Tasks

- [ ] Task 1: Migrate push/index.ts
- [ ] Task 2: Migrate pull/index.ts
- [ ] Task 3: Migrate core/pos-data-service.ts
- [ ] Task 4: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `packages/pos-sync/src/push/index.ts` | queryAll, execute → Kysely |
| `packages/pos-sync/src/pull/index.ts` | queryAll → Kysely |
| `packages/pos-sync/src/core/pos-data-service.ts` | queryAll → Kysely |

## Pattern Conversion

```typescript
// SELECT with params
db.queryAll("SELECT * FROM items WHERE company_id = ?", [companyId])
  → db.selectFrom('items').selectAll().where('company_id', '=', companyId).execute()

// INSERT/UPDATE/DELETE
db.execute("INSERT INTO table (col) VALUES (?)", [value])
  → db.insertInto('table').values({ col: value }).execute()
```

## Dev Notes

### Dependencies
- Stories 18.3a and 18.3b should be complete first (sync-core migrations)
- pos-sync depends on sync-core data queries

### Testing
- `npm run typecheck -w @jurnapod/pos-sync`
- `npm run build -w @jurnapod/pos-sync`

## Definition of Done

- [ ] All 3 files migrated to pure Kysely
- [ ] No mysql2-style patterns remain
- [ ] Typecheck passes
- [ ] Build passes

## References

- [pos-sync AGENTS.md]
- [Epic 18: Pure Kysely Migration]

---

## Dev Agent Record

<!-- To be filled by dev agent -->
