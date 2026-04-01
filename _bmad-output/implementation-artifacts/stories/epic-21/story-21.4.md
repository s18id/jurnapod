# Story 21.4: Keep and Bound `/sync/check-duplicate` Semantics

**Status:** backlog  
**Epic:** Epic 21  
**Story Points:** 1  
**Priority:** P2  
**Risk:** LOW  
**Assigned:** bmad-dev

---

## Overview

Keep `/sync/check-duplicate` endpoint and document/enforce its boundary as a preflight helper. Authoritative idempotency remains in sync push processing.

## Acceptance Criteria

- [ ] Route and library docs/comments explicitly describe preflight-only semantics.
- [ ] Tests confirm endpoint is company-scoped and read-only.
- [ ] No behavior implies replacement of push idempotency authority.

## Files (Expected)

- `apps/api/src/routes/sync/check-duplicate.ts`
- `apps/api/src/lib/sync/check-duplicate.ts`
- sync route tests (`apps/api/src/routes/sync/sync.test.ts` or equivalent)

## Sprint Plan

- **Owner Role:** @bmad-dev
- **Estimate:** 1 SP (~0.5 day)
- **Dependency:** Story 21.2 done
- **Test Gate:** sync route unit + sync suite pass with semantics documentation review

## Validation

- `npm run test:unit:single -w @jurnapod/api src/routes/sync/sync.test.ts`
- `npm run test:unit:sync -w @jurnapod/api`
