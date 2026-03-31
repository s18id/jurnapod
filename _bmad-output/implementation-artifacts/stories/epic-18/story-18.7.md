# Story 18.7: Migrate modules-platform to Pure Kysely

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - Packages

---

## Story

As a developer,
I want `modules-platform` to use pure Kysely API for all database operations,
so that the package fully migrates from mysql2-style patterns.

## Context

modules-platform audit-service currently uses `this.db.execute()` which is a mysql2-style pattern. This needs to be migrated to Kysely's `sql` template tag or query builder.

## Acceptance Criteria

1. **Migrate audit-service.ts** (AC-1)
   - Convert `this.db.execute(sql, params)` → `` sql`...`.execute(this.db) ``
   - Keep retry logic intact
   - Verify transactions work correctly

2. **Typecheck passes** (AC-2)
   - `npm run typecheck -w @jurnapod/modules-platform`

## Tasks

- [ ] Task 1: Migrate audit-service.ts
- [ ] Task 2: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `packages/modules/platform/src/audit-service.ts` | execute → sql template |

## Pattern Conversion

```typescript
// BEFORE (mysql2 style)
await this.db.execute(
  'INSERT INTO audit_logs (company_id, ...) VALUES (?, ...)',
  [companyId, ...]
);

// AFTER (Kysely sql template)
import { sql } from 'kysely';
await sql`INSERT INTO audit_logs (company_id, ...) VALUES (${companyId}, ...)`.execute(this.db);

// OR (Kysely query builder)
await this.db.insertInto('audit_logs').values({
  company_id: companyId,
  ...
}).execute();
```

## Dev Notes

### Important Notes
- The audit-service has retry logic for deadlocks - ensure this is preserved
- The `sql` template tag provides SQL escaping automatically
- For complex queries with many parameters, consider using Kysely query builder

### Dependencies
- Story 18.1 (verify db exports) should be complete first

### Testing
- `npm run typecheck -w @jurnapod/modules-platform`
- `npm run build -w @jurnapod/modules-platform`

## Definition of Done

- [ ] audit-service.ts migrated to pure Kysely
- [ ] No `db.execute(sql, params)` pattern remains
- [ ] Retry logic preserved
- [ ] Typecheck passes
- [ ] Build passes

## References

- [modules-platform AGENTS.md]
- [Epic 18: Pure Kysely Migration]

---

## Dev Agent Record

<!-- To be filled by dev agent -->
