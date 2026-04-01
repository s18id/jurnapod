# Story 21.3: Retire Legacy API Pull Builder Runtime Path

**Status:** backlog  
**Epic:** Epic 21  
**Story Points:** 5  
**Priority:** P1  
**Risk:** HIGH  
**Assigned:** bmad-dev

---

## Overview

Retire duplicated API pull-runtime implementation in `lib/sync/master-data.ts` from runtime ownership. Keep sync runtime package-first and migrate tests to route/module-level behavior checks.

## Acceptance Criteria

- [ ] Runtime route/module path no longer depends on `apps/api/src/lib/sync/master-data.ts` behavior.
- [ ] Equivalent test coverage exists via route/module integration tests.
- [ ] Pull payload contract behavior remains unchanged (`since_version` / `data_version`).
- [ ] Outlet scoping, thumbnail payload coverage, and variant payload coverage remain verified.

## Files (Expected)

- `apps/api/src/lib/sync/master-data.ts` (deprecate/remove only when safe)
- `apps/api/src/lib/master-data.sync-regression.test.ts`
- `apps/api/src/lib/master-data.thumbnail-sync.test.ts`
- `apps/api/src/routes/sync/pull.test.ts`

## Sprint Plan

- **Owner Role:** @bmad-dev
- **Estimate:** 5 SP (~2-2.5 days)
- **Dependency:** Story 21.4 done (mandatory sequence)
- **Test Gate:** pull route + sync + critical suites pass before handoff

## Validation

- `npm run test:unit:single -w @jurnapod/api src/routes/sync/pull.test.ts`
- `npm run test:unit:sync -w @jurnapod/api`
- `npm run test:unit:critical -w @jurnapod/api`
