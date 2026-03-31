# Story 18.5: Migrate backoffice-sync to Pure Kysely

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - Packages

---

## Story

As a developer,
I want `backoffice-sync` to use pure Kysely API for all database operations,
so that the package fully migrates from mysql2-style patterns.

## Context

backoffice-sync package uses mysql2-style patterns like `db.queryAll()` and `db.execute()`. This needs to be migrated to Kysely.

## Acceptance Criteria

1. **Migrate core/backoffice-data-service.ts** (AC-1)
   - Convert `db.queryAll`, `db.execute` → Kysely

2. **Migrate batch/batch-processor.ts** (AC-2)
   - Same pattern conversion

3. **Migrate scheduler/export-scheduler.ts** (AC-3)
   - Same pattern conversion

4. **Typecheck passes** (AC-4)
   - `npm run typecheck -w @jurnapod/backoffice-sync`

## Tasks

- [ ] Task 1: Migrate core/backoffice-data-service.ts
- [ ] Task 2: Migrate batch/batch-processor.ts
- [ ] Task 3: Migrate scheduler/export-scheduler.ts
- [ ] Task 4: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `packages/backoffice-sync/src/core/backoffice-data-service.ts` | queryAll, execute → Kysely |
| `packages/backoffice-sync/src/batch/batch-processor.ts` | query, execute → Kysely |
| `packages/backoffice-sync/src/scheduler/export-scheduler.ts` | query, execute → Kysely |

## Pattern Conversion

```typescript
// SELECT
db.queryAll("SELECT * FROM table WHERE company_id = ?", [companyId])
  → db.selectFrom('table').selectAll().where('company_id', '=', companyId).execute()

// INSERT/UPDATE/DELETE
db.execute("INSERT INTO table (col) VALUES (?)", [value])
  → db.insertInto('table').values({ col: value }).execute()
```

## Dev Notes

### Dependencies
- Stories 18.3a and 18.3b should be complete first (sync-core migrations)
- backoffice-sync depends on sync-core data queries

### Testing
- `npm run typecheck -w @jurnapod/backoffice-sync`
- `npm run build -w @jurnapod/backoffice-sync`

## Definition of Done

- [ ] All 3 files migrated to pure Kysely
- [ ] No mysql2-style patterns remain
- [ ] Typecheck passes
- [ ] Build passes

## References

- [backoffice-sync AGENTS.md]
- [Epic 18: Pure Kysely Migration]

---

## Dev Agent Record

<!-- To be filled by dev agent -->
