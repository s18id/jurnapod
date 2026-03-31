# Story 19.11: Migrate api/lib Reports to Pure Kysely

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - API (Deferred)

---

## Story

As a developer,
I want `api/src/lib/reports` modules to use pure Kysely API,
so that reporting modules are properly migrated.

## Acceptance Criteria

1. **Migrate reports.ts** (AC-1)
2. **Migrate reconciliation-service.ts** (AC-2)
3. **Typecheck passes** (AC-3)

## Tasks

- [ ] Task 1: Migrate report files
- [ ] Task 2: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/lib/reports.ts` | mysql2 → Kysely |
| `apps/api/src/lib/reconciliation-service.ts` | mysql2 → Kysely |

## Dev Notes

### Dependencies
- Story 19.10 (cost-recipe) should be complete first

### Testing
- `npm run typecheck -w @jurnapod/api`

## Definition of Done

- [ ] Report files migrated
- [ ] Typecheck passes

## References

- [Epic 19: Pure Kysely Migration]
