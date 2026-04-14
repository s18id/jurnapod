# Story 21.4: Keep and Bound `/sync/check-duplicate` Semantics

**Status:** done  
**Epic:** Epic 21  
**Story Points:** 1  
**Priority:** P2  
**Risk:** LOW  
**Assigned:** bmad-agent-dev

---

## Overview

Keep `/sync/check-duplicate` endpoint and document/enforce its boundary as a preflight helper. Authoritative idempotency remains in sync push processing.

## Acceptance Criteria

- [x] Route and library docs/comments explicitly describe preflight-only semantics.
- [x] Tests confirm endpoint is company-scoped and read-only.
- [x] No behavior implies replacement of push idempotency authority.

## Files (Expected)

- `apps/api/src/routes/sync/check-duplicate.ts`
- `apps/api/src/lib/sync/check-duplicate.ts`
- sync route tests (`apps/api/src/routes/sync/sync.test.ts` or equivalent)

## Sprint Plan

- **Owner Role:** @bmad-agent-dev
- **Estimate:** 1 SP (~0.5 day)
- **Dependency:** Story 21.2 done
- **Test Gate:** sync route unit + sync suite pass with semantics documentation review

## Validation

- `npm run test:unit:single -w @jurnapod/api src/routes/sync/sync.test.ts`
- `npm run test:unit:sync -w @jurnapod/api`

## Completion Notes

### Files Modified

1. **apps/api/src/routes/sync/check-duplicate.ts**
   - Added explicit preflight-only semantics documentation
   - Documented security model (company-scoped, read-only)
   - Clarified idempotency authority remains in `/sync/push`

2. **apps/api/src/lib/sync/check-duplicate.ts**
   - Added semantic boundary documentation
   - Clarified this is NOT the authoritative idempotency check
   - Documented read-only nature and potential staleness

3. **apps/api/src/routes/sync/sync.test.ts**
   - Added test: "check-duplicate is read-only (preflight-only semantics)"
   - Proves no state modification occurs during duplicate check
   - Verifies `updated_at` timestamp unchanged after read
   - Confirms no duplicate entries created

### Test Evidence

```
npm run test:unit:single -w @jurnapod/api src/routes/sync/sync.test.ts
# PASS: 9 tests, 4 suites, 0 failures

npm run test:unit:sync -w @jurnapod/api  
# PASS: 83 tests, 37 suites, 0 failures
```

### Semantic Guarantees Proven

1. **Company-scoped (tenant isolation)**: Existing test "check-duplicate is scoped to company" verifies cross-company queries return nothing
2. **Read-only**: New test verifies `updated_at` unchanged and no duplicate records created
