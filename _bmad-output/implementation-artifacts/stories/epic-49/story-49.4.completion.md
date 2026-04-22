# Story 49.4 Completion Notes

**Story:** Platform + ACL Suite Determinism Hardening  
**Epic:** 49  
**Status:** DONE ✅  
**Implementation Date:** 2026-04-22  
**Reviewer:** @bmad-review (GO)  
**Story Owner Sign-off:** confirmed

---

## Acceptance Criteria Evidence

### AC1: Tenant Isolation Verification ✅
- Platform/company/users suites hardened to deterministic assertions.
- Cross-tenant negative paths use strict expected statuses (no permissive `[200,403]` ranges).
- Negative permission tests use low-privilege CASHIER tokens where denial is expected.

### AC2: ACL Suite Determinism ✅
- ACL/auth suites remain on canonical fixture flows.
- Permission assertions hardened to deterministic expectations.
- No ad-hoc ACL mutation paths introduced.

### AC3: Time-Dependent Fixes ✅
- Date/random-based ID generation removed in in-scope API suites.
- Shared deterministic helper introduced: `apps/api/__test__/helpers/tags.ts`.
- Auth time assertions hardened with fake timers in:
  - `packages/auth/__test__/integration/tokens.integration.test.ts`
  - `packages/auth/__test__/integration/refresh-tokens.integration.test.ts`

### AC4: Pool Cleanup Verification ✅
- All in-scope API suites use RWLock (`acquireReadLock`/`releaseReadLock`).
- `afterAll` cleanup made exception-safe via `try/finally` lock release.
- DB cleanup hooks present (`closeTestDb` for API; `closeTestPool` for auth).

### AC5: 3-Consecutive-Green Rerun Proof ✅
- All 22 in-scope suites passed 3 consecutive runs.
- Evidence logs:
  - `apps/api/logs/s49-4-*-run-{1,2,3}.log`
  - `packages/auth/logs/s49-4-*-run-{1,2,3}.log`
- Verification check on AC5 logs found no failure markers (`Failed Tests`, `Test Files ... failed`, `No test files found`, `npm error`).

---

## Key Artifacts Updated

- `_bmad-output/implementation-artifacts/stories/epic-49/story-49.4.md` (status + evidence)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (`49-4-...: done`)
- `apps/api/__test__/helpers/tags.ts` (shared deterministic generator)
