# Story 19.1: Migrate api/lib Shared Utilities to Pure Kysely

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - API (Deferred)

---

## Story

As a developer,
I want `api/src/lib/shared` utilities to use pure Kysely API,
so that the foundation is correct before migrating dependent modules.

## Context

`shared/master-data-utils.ts` contains `withTransaction` and other utilities used by many lib files. This needs to be migrated first as other modules depend on it.

## Acceptance Criteria

1. **Migrate shared/master-data-utils.ts** (AC-1)
   - Convert `withTransaction` from mysql2 to Kysely
   - Convert any `execute()` calls to Kysely

2. **Migrate shared/common-utils.ts** (AC-2)
   - Same pattern conversion

3. **Typecheck passes** (AC-3)
   - `npm run typecheck -w @jurnapod/api`

## Tasks

- [ ] Task 1: Migrate shared/master-data-utils.ts
- [ ] Task 2: Migrate shared/common-utils.ts
- [ ] Task 3: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/lib/shared/master-data-utils.ts` | withTransaction, execute → Kysely |
| `apps/api/src/lib/shared/common-utils.ts` | mysql2 patterns → Kysely |

## Pattern Conversion

```typescript
// Transaction wrapper
// BEFORE
const connection = await pool.getConnection();
await connection.beginTransaction();
try { result = await operation(connection); await connection.commit(); }
catch { await connection.rollback(); throw; }
finally { connection.release(); }

// AFTER
import { sql } from 'kysely';
await db.transaction().execute(async (trx) => {
  // use trx for all operations
});
```

## Dev Notes

### Dependencies
- Epic 18 (packages) should be complete first
- This story is a foundation for other API migrations

### Testing
- `npm run typecheck -w @jurnapod/api`
- Run affected tests

## Definition of Done

- [ ] master-data-utils.ts migrated
- [ ] common-utils.ts migrated
- [ ] No mysql2 patterns remain
- [ ] Typecheck passes

## References

- [API AGENTS.md]
- [Epic 19: Pure Kysely Migration]

---

## Dev Agent Record

<!-- To be filled by dev agent -->
