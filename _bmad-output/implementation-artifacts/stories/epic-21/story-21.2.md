# Story 21.2: Extract Sync Push Adapters from Route

**Status:** done  
**Epic:** Epic 21  
**Story Points:** 3  
**Priority:** P1  
**Risk:** MEDIUM  
**Assigned:** bmad-agent-dev

---

## Overview

Move sync push payload mapping functions out of route file into a dedicated adapter module so sync push route remains thin orchestration.

## Acceptance Criteria

- [x] Push payload conversion helpers are moved to `lib/sync/push/adapters`.
- [x] `routes/sync/push.ts` mapper logic is extracted, keeping route orchestration behavior unchanged.
- [x] Adapter tests cover transaction/order/variant mapping edge cases.
- [x] Push sync route behavior remains unchanged.

## Files (Expected)

- `apps/api/src/lib/sync/push/adapters.ts` (new)
- `apps/api/src/routes/sync/push.ts`
- `apps/api/src/lib/sync/push/adapters.test.ts` (new or equivalent)

## Sprint Plan

- **Owner Role:** @bmad-agent-dev
- **Estimate:** 3 SP (~1.5 days)
- **Dependency:** Story 21.1 done
- **Test Gate:** push route + sync unit suites must pass before handoff

## Validation

- `npm run test:unit:single -w @jurnapod/api src/routes/sync/push.test.ts`
- `npm run test:unit:sync -w @jurnapod/api`
