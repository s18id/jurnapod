# Story 18.3b: Migrate sync-core Data Queries (Part 2) + Jobs

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - Packages

---

## Story

As a developer,
I want `sync-core` remaining data queries and jobs to use pure Kysely API,
so that the package fully migrates from mysql2-style patterns.

## Context

Continuation of story 18.3a. This covers the remaining data query files and the data retention job.

## Acceptance Criteria

1. **Migrate transaction-queries.ts** (AC-1)
   - Convert `db.queryAll`, `db.execute` → Kysely

2. **Migrate reservation-queries.ts** (AC-2)
   - Same pattern conversion

3. **Migrate config-queries.ts** (AC-3)
   - Same pattern conversion

4. **Migrate sync-version-queries.ts** (AC-4)
   - Same pattern conversion

5. **Migrate data-retention.job.ts** (AC-5)
   - Convert `db.beginTransaction()`, `db.commit()`, `db.rollback()` → `db.transaction().execute()`
   - Convert `db.execute()` → Kysely

6. **Typecheck passes** (AC-6)
   - `npm run typecheck -w @jurnapod/sync-core`

## Tasks

- [ ] Task 1: Migrate transaction-queries.ts
- [ ] Task 2: Migrate reservation-queries.ts
- [ ] Task 3: Migrate config-queries.ts
- [ ] Task 4: Migrate sync-version-queries.ts
- [ ] Task 5: Migrate data-retention.job.ts
- [ ] Task 6: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `packages/sync-core/src/data/transaction-queries.ts` | queryAll, execute → Kysely |
| `packages/sync-core/src/data/reservation-queries.ts` | queryAll → Kysely |
| `packages/sync-core/src/data/config-queries.ts` | queryAll, queryOne → Kysely |
| `packages/sync-core/src/data/sync-version-queries.ts` | queryOne, execute → Kysely |
| `packages/sync-core/src/jobs/data-retention.job.ts` | begin/commit/rollback → transaction, execute → Kysely |

## Pattern Conversion

```typescript
// Transaction conversion
// BEFORE
await this.db.beginTransaction();
try {
  await this.db.execute(sql, params);
  await this.db.commit();
} catch {
  await this.db.rollback();
}

// AFTER
await this.db.transaction().execute(async (trx) => {
  await trx.execute(sql`${sql.join(params.map(p => sql`${p}`), sql`, `)}`);
});
```

## Dev Notes

### Dependencies
- Story 18.3a should be complete first
- Uses `KyselySchema` type from `@jurnapod/db`

### Testing
- `npm run typecheck -w @jurnapod/sync-core`
- `npm run build -w @jurnapod/sync-core`

## Definition of Done

- [ ] All 5 files migrated to pure Kysely
- [ ] No mysql2-style patterns remain
- [ ] Typecheck passes
- [ ] Build passes

## References

- [sync-core AGENTS.md]
- [Epic 18: Pure Kysely Migration]

---

## Dev Agent Record

<!-- To be filled by dev agent -->
