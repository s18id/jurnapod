# Story 19.12: Migrate api/routes to Library-First Pattern

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - API (Deferred)

---

## Story

As a developer,
I want `api/src/routes` to use library-first pattern (no direct getDbPool imports),
so that all database access goes through lib modules.

## Context

Routes should not directly import `getDbPool` or perform database operations. They should delegate to lib modules which handle the Kysely migration internally.

## Acceptance Criteria

1. **Remove direct getDbPool from routes** (AC-1)
   - Identify all routes using `getDbPool`
   - Ensure they use lib functions instead

2. **Ensure lib modules handle Kysely** (AC-2)
   - Lib functions should use Kysely internally
   - Routes should not need to know about DB implementation

3. **Typecheck passes** (AC-3)
   - `npm run typecheck -w @jurnapod/api`

## Tasks

- [ ] Task 1: Identify routes with direct getDbPool
- [ ] Task 2: Migrate routes to use lib functions
- [ ] Task 3: Run typecheck

## Routes to Check

| Route | Current | Target |
|-------|---------|--------|
| `routes/stock.ts` | uses getDbPool | use lib |
| `routes/health.ts` | uses getDbPool | use lib |
| `routes/import.ts` | uses getDbPool | use lib |
| `routes/sync/push.ts` | uses getDbPool | use lib |
| `routes/sync/pull.ts` | uses getDbPool | use lib |
| `routes/tax-rates.ts` | uses getDbPool | use lib |

## Dev Notes

### Dependencies
- Stories 19.1-19.11 should be complete first
- Routes depend on lib modules being migrated first

### Testing
- `npm run typecheck -w @jurnapod/api`

## Definition of Done

- [ ] No direct `getDbPool` imports in routes
- [ ] All routes use lib functions
- [ ] Typecheck passes

## References

- [API AGENTS.md - Library-First Architecture]
- [Epic 19: Pure Kysely Migration]
