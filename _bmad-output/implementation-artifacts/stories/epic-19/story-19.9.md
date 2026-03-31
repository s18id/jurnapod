# Story 19.9: Migrate api/lib Fiscal to Pure Kysely

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - API (Deferred)

---

## Story

As a developer,
I want `api/src/lib/fiscal` modules to use pure Kysely API,
so that fiscal modules are properly migrated.

## Acceptance Criteria

1. **Migrate fiscal-years.ts** (AC-1)
2. **Migrate depreciation.ts** (AC-2)
3. **Migrate fixed-assets/*.ts** (AC-3)
4. **Typecheck passes** (AC-4)

## Tasks

- [ ] Task 1: Migrate fiscal files
- [ ] Task 2: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/lib/fiscal-years.ts` | mysql2 → Kysely |
| `apps/api/src/lib/depreciation.ts` | mysql2 → Kysely |
| `apps/api/src/lib/fixed-assets/index.ts` | mysql2 → Kysely |
| `apps/api/src/lib/fixed-assets-lifecycle.ts` | mysql2 → Kysely |

## Dev Notes

### Dependencies
- Story 19.8 (email) should be complete first

### Testing
- `npm run typecheck -w @jurnapod/api`

## Definition of Done

- [ ] All fiscal files migrated
- [ ] Typecheck passes

## References

- [Epic 19: Pure Kysely Migration]
