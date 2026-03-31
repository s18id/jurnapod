# Story 19.13: Final Verification

Status: backlog
Priority: P1
Epic: Pure Kysely Migration - API (Deferred)

---

## Story

As a developer,
I want all packages and API to pass typecheck and tests after Kysely migration,
so that the migration is complete and verified.

## Context

Final verification step after all migrations are complete.

## Acceptance Criteria

1. **All packages typecheck** (AC-1)
   - `@jurnapod/db`
   - `@jurnapod/auth`
   - `@jurnapod/sync-core`
   - `@jurnapod/pos-sync`
   - `@jurnapod/backoffice-sync`
   - `@jurnapod/modules-accounting`
   - `@jurnapod/modules-platform`
   - `@jurnapod/api`

2. **All builds pass** (AC-2)
   - All packages build successfully

3. **Tests pass** (AC-3)
   - Critical path tests pass
   - No regressions

## Tasks

- [ ] Task 1: Run typecheck on all packages
- [ ] Task 2: Run build on all packages
- [ ] Task 3: Run critical path tests
- [ ] Task 4: Document any remaining issues

## Verification Commands

```bash
# Typecheck all packages
npm run typecheck -w @jurnapod/db
npm run typecheck -w @jurnapod/auth
npm run typecheck -w @jurnapod/sync-core
npm run typecheck -w @jurnapod/pos-sync
npm run typecheck -w @jurnapod/backoffice-sync
npm run typecheck -w @jurnapod/modules-accounting
npm run typecheck -w @jurnapod/modules-platform
npm run typecheck -w @jurnapod/api

# Build all packages
npm run build -w @jurnapod/db
npm run build -w @jurnapod/auth
npm run build -w @jurnapod/sync-core
npm run build -w @jurnapod/pos-sync
npm run build -w @jurnapod/backoffice-sync
npm run build -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-platform
npm run build -w @jurnapod/api

# Critical path tests
npm run test:unit:critical -w @jurnapod/api
```

## Dev Notes

### Dependencies
- All stories 19.1-19.12 should be complete first

## Definition of Done

- [ ] All packages typecheck (0 errors)
- [ ] All packages build successfully
- [ ] Critical path tests pass
- [ ] Any remaining issues documented

## References

- [Epic 19: Pure Kysely Migration]
