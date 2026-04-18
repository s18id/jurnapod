# Story 21.1: Centralize PosSyncModule Lifecycle

**Status:** done  
**Epic:** Epic 21  
**Story Points:** 2  
**Priority:** P1  
**Risk:** LOW  
**Assigned:** bmad-dev

---

## Overview

Remove duplicate `PosSyncModule` singleton/init/get logic from sync pull and sync push routes. Create one shared lifecycle owner in API library layer.

## Acceptance Criteria

- [x] Exactly one shared lifecycle owner exists for `PosSyncModule` initialization and retrieval.
- [x] `routes/sync/pull.ts` and `routes/sync/push.ts` no longer define duplicate singleton/init/get logic.
- [x] Initialization config and runtime behavior remain unchanged.
- [x] Route tests for pull/push remain passing.

## Files (Expected)

- `apps/api/src/lib/sync-modules.ts` (or `apps/api/src/lib/sync/pos-module.ts`)
- `apps/api/src/routes/sync/pull.ts`
- `apps/api/src/routes/sync/push.ts`

## Sprint Plan

- **Owner Role:** @bmad-dev
- **Estimate:** 2 SP (~1 day)
- **Dependency:** None (first story in mandatory sequence)
- **Test Gate:** pull + push route unit tests must pass before handoff

## Validation

- `npm run test:unit:single -w @jurnapod/api src/routes/sync/pull.test.ts`
- `npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts`
