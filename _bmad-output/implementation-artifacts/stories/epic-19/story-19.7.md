# Story 19.7: Migrate api/lib Settings to Pure Kysely

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - API (Deferred)

---

## Story

As a developer,
I want `api/src/lib/settings` modules to use pure Kysely API,
so that settings modules are properly migrated.

## Acceptance Criteria

1. **Migrate settings.ts** (AC-1)
2. **Migrate settings-modules.ts** (AC-2)
3. **Migrate static-pages.ts** (AC-3)
4. **Migrate static-pages-admin.ts** (AC-4)
5. **Migrate platform-settings.ts** (AC-5)
6. **Typecheck passes** (AC-6)

## Tasks

- [ ] Task 1: Migrate settings files
- [ ] Task 2: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/lib/settings.ts` | mysql2 → Kysely |
| `apps/api/src/lib/settings-modules.ts` | mysql2 → Kysely |
| `apps/api/src/lib/static-pages.ts` | mysql2 → Kysely |
| `apps/api/src/lib/static-pages-admin.ts` | mysql2 → Kysely |
| `apps/api/src/lib/platform-settings.ts` | mysql2 → Kysely |

## Dev Notes

### Dependencies
- Story 19.6 (operations) should be complete first

### Testing
- `npm run typecheck -w @jurnapod/api`

## Definition of Done

- [ ] All settings files migrated
- [ ] Typecheck passes

## References

- [Epic 19: Pure Kysely Migration]
