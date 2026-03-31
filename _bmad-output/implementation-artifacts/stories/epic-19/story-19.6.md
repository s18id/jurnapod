# Story 19.6: Migrate api/lib Operations to Pure Kysely

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - API (Deferred)

---

## Story

As a developer,
I want `api/src/lib/operations` modules to use pure Kysely API,
so that operations modules are properly migrated.

## Context

Operations modules handle sessions, reservations, sync, and table management.

## Acceptance Criteria

1. **Migrate service-sessions/*.ts** (AC-1)
2. **Migrate reservations/*.ts** (AC-2)
3. **Migrate sync/*.ts** (AC-3)
4. **Migrate table-occupancy.ts** (AC-4)
5. **Typecheck passes** (AC-5)

## Tasks

- [ ] Task 1: Migrate service-sessions files
- [ ] Task 2: Migrate reservations files
- [ ] Task 3: Migrate sync files
- [ ] Task 4: Migrate table-occupancy.ts
- [ ] Task 5: Run typecheck

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/lib/service-sessions.ts` | mysql2 → Kysely |
| `apps/api/src/lib/service-sessions/*.ts` | mysql2 → Kysely |
| `apps/api/src/lib/reservations/*.ts` | mysql2 → Kysely |
| `apps/api/src/lib/sync/*.ts` | mysql2 → Kysely |
| `apps/api/src/lib/table-occupancy.ts` | mysql2 → Kysely |

## Dev Notes

### Dependencies
- Story 19.5 (accounting) should be complete first

### Testing
- `npm run typecheck -w @jurnapod/api`

## Definition of Done

- [ ] All operations files migrated
- [ ] Typecheck passes

## References

- [API AGENTS.md]
- [Epic 19: Pure Kysely Migration]

---

## Dev Agent Record

<!-- To be filled by dev agent -->
