# Story 19.10: Migrate api/lib Cost-Recipe to Pure Kysely

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - API (Deferred)

---

## Story

As a developer,
I want `api/src/lib/cost-recipe` modules to use pure Kysely API,
so that cost and recipe modules are properly migrated.

## Acceptance Criteria

1. **Migrate cost-tracking.ts** (AC-1)
2. **Migrate cost-auditability.test.ts** (AC-2) - verify tests work
3. **Typecheck passes** (AC-3)

## Tasks

- [ ] Task 1: Migrate cost-tracking.ts
- [ ] Task 2: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/lib/cost-tracking.ts` | mysql2 → Kysely |
| `apps/api/src/lib/cost-tracking.db.test.ts` | mysql2 → Kysely |

## Dev Notes

### Dependencies
- Story 19.9 (fiscal) should be complete first

### Testing
- `npm run typecheck -w @jurnapod/api`

## Definition of Done

- [ ] Cost-tracking files migrated
- [ ] Typecheck passes

## References

- [Epic 19: Pure Kysely Migration]
