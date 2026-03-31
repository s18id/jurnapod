# Story 19.8: Migrate api/lib Email to Pure Kysely

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - API (Deferred)

---

## Story

As a developer,
I want `api/src/lib/email` modules to use pure Kysely API,
so that email modules are properly migrated.

## Acceptance Criteria

1. **Migrate email-outbox.ts** (AC-1)
2. **Migrate email-tokens.ts** (AC-2)
3. **Migrate password-reset-throttle.ts** (AC-3)
4. **Typecheck passes** (AC-4)

## Tasks

- [ ] Task 1: Migrate email files
- [ ] Task 2: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/lib/email-outbox.ts` | mysql2 → Kysely |
| `apps/api/src/lib/email-tokens.ts` | mysql2 → Kysely |
| `apps/api/src/lib/password-reset-throttle.ts` | mysql2 → Kysely |

## Dev Notes

### Dependencies
- Story 19.7 (settings) should be complete first

### Testing
- `npm run typecheck -w @jurnapod/api`

## Definition of Done

- [ ] All email files migrated
- [ ] Typecheck passes

## References

- [Epic 19: Pure Kysely Migration]
