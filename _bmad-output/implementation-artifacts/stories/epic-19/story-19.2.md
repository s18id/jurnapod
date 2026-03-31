# Story 19.2: Migrate api/lib Foundation to Pure Kysely

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - API (Deferred)

---

## Story

As a developer,
I want `api/src/lib` foundation modules (companies, users, outlets) to use pure Kysely API,
so that these core modules are properly migrated.

## Context

Foundation modules are used by many other modules. Migrate these after shared utilities.

## Acceptance Criteria

1. **Migrate companies.ts** (AC-1)
   - Convert mysql2 patterns → Kysely

2. **Migrate users.ts** (AC-2)
   - Same pattern conversion

3. **Migrate outlets.ts** (AC-3)
   - Same pattern conversion

4. **Typecheck passes** (AC-4)
   - `npm run typecheck -w @jurnapod/api`

## Tasks

- [ ] Task 1: Migrate companies.ts
- [ ] Task 2: Migrate users.ts
- [ ] Task 3: Migrate outlets.ts
- [ ] Task 4: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/lib/companies.ts` | mysql2 patterns → Kysely |
| `apps/api/src/lib/users.ts` | mysql2 patterns → Kysely |
| `apps/api/src/lib/outlets.ts` | mysql2 patterns → Kysely |

## Pattern Conversion

```typescript
// SELECT
pool.execute("SELECT * FROM companies WHERE id = ?", [id])
  → db.selectFrom('companies').where('id', '=', id).executeTakeFirst()

// INSERT
pool.execute("INSERT INTO companies (...) VALUES (...)", [...])
  → db.insertInto('companies').values({...}).execute()
```

## Dev Notes

### Dependencies
- Story 19.1 (shared utilities) should be complete first

### Testing
- `npm run typecheck -w @jurnapod/api`

## Definition of Done

- [ ] All 3 files migrated to pure Kysely
- [ ] No mysql2 patterns remain
- [ ] Typecheck passes

## References

- [API AGENTS.md]
- [Epic 19: Pure Kysely Migration]

---

## Dev Agent Record

<!-- To be filled by dev agent -->
