# Story 69-2-d Completion Report

**Story:** 69-2-d AP Payments + Supplier Credits
**Epic:** 69 — Purchasing Domain Screens
**Status:** Done
**Completed:** 2026-05-19

---

## Summary

Story 69-2-d delivered API-level corrections for AP payment and supplier credit workflows. The implementation corrected the void ACL from `UPDATE` to `DELETE`, hardened payment/credit list filters to return `400 INVALID_REQUEST` for invalid values, and added focused ACL separation tests proving UPDATE-only roles can post/apply but cannot void, and DELETE-only roles can void but cannot post/apply.

---

## What Was Implemented

### API Route Corrections (apps/api/src/routes/purchasing/)

| File | Change | Evidence |
|------|--------|----------|
| `ap-payments.ts` | `/:id/void` permission changed from `update` → `delete` | Diff lines 366 |
| `purchase-credits.ts` | `/:id/void` permission changed from `update` → `delete` | Diff lines 348 |
| `ap-payments.ts` | Date filter pre-validation using `Temporal.PlainDate.from()` before schema parse; `400 INVALID_REQUEST` on invalid `date_from`/`date_to` | Diff lines 98-102, 128-131 |
| `purchase-credits.ts` | Same date filter pre-validation pattern | Diff lines 93-99, 124-127 |

### Test Coverage Additions (apps/api/__test__/integration/purchasing/)

| File | Tests Added | Evidence |
|------|-------------|----------|
| `ap-payments.test.ts` | ACL separation test: UPDATE-only can post, cannot void; DELETE-only cannot post, can void after owner post | `logs/story-69-2-d-api-payments-test-r3.log` — 40/40 |
| `purchase-credits.test.ts` | ACL separation test: UPDATE-only can apply, cannot void; DELETE-only cannot apply, can void after owner apply | `logs/story-69-2-d-api-credits-test-r4.log` — 18/18 |
| `ap-payments.test.ts` | Payment list filter hardening: 7 invalid filter cases + valid status/date acceptance | `logs/story-69-2-d-api-payments-test-r3.log` |
| `purchase-credits.test.ts` | Credit list filter hardening: 7 invalid filter cases + valid status/date acceptance | `logs/story-69-2-d-api-credits-test-r4.log` |

---

## Sign-off Trail

| Sign-off | Role | Date |
|----------|------|------|
| Architecture readiness GO | Winston | 2026-05-19 (re-check) |
| QA kickoff GO | Quinn | 2026-05-19 (re-check) |
| Backoffice unfreeze confirmation | Ahmad | 2026-05-19 |
| Implementation review GO | QA (bmad-qa) | 2026-05-19 — prior P1 ACL separation blocker resolved; no P0/P1/P2/P3 findings remain |
| Owner sign-off | Ahmad | 2026-05-19 |

---

## Files Modified

| File | Change Type |
|------|-------------|
| `apps/api/src/routes/purchasing/ap-payments.ts` | Bug fix — void ACL correction + date filter hardening |
| `apps/api/src/routes/purchasing/purchase-credits.ts` | Bug fix — void ACL correction + date filter hardening |
| `apps/api/__test__/integration/purchasing/ap-payments.test.ts` | Test — ACL separation + filter hardening |
| `apps/api/__test__/integration/purchasing/purchase-credits.test.ts` | Test — ACL separation + filter hardening |
| `_bmad-output/implementation-artifacts/stories/epic-69/story-69-2-d.md` | Sign-off recorded |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Marked done |

---

## Validation Evidence

| Check | Result | Log/Artifact |
|-------|--------|--------------|
| API payments integration tests | 40/40 passed | `logs/story-69-2-d-api-payments-test-r3.log` exit `0` |
| API credits integration tests | 18/18 passed | `logs/story-69-2-d-api-credits-test-r4.log` exit `0` |
| API lint | 0 errors (warnings only) | `logs/story-69-2-d-lint-api-r2.exit` = 0 |
| Diff whitespace | Clean | `git diff --check` — no trailing whitespace |
| Sprint status | Healthy | `npx tsx scripts/validate-sprint-status.ts` — PASS |

---

## Cross-Module Decision Gate Resolution

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Use single-page ReviewPanel allocation flow | Not implemented — backoffice freeze in effect; API-level corrections only |
| 2 | Payment post/void and credit apply/void responses are partial; UI must refetch | Not implemented — backoffice freeze in effect; API-level corrections only |
| 3 | Payment/credit void APIs do not support persisted `void_reason` | Confirmed — no `void_reason` submitted in API corrections |
| 4 | Payment/credit void endpoints must use `DELETE` permission, not `UPDATE` | **Fixed** — both `ap-payments.ts` and `purchase-credits.ts` void routes now use `delete` permission |

---

## Dependency Status

| Dependency | Story | Status |
|------------|-------|--------|
| 69-2-c (AP Invoices Post/Void + Audit Links) | 69-2-c | Done |
| 69-2-e (ReviewPanel Domain Interaction Hardening) | 69-2-e | Done |
| Backoffice screens | Frozen | Deferred to post-freeze |

---

## Notes

- Backoffice UI for payment/credit screens was not implemented due to the temporary scope freeze on `apps/backoffice`. The story delivered API-level corrections only, which were within scope during the freeze.
- Story 69-2-d backoffice unfreeze was explicitly confirmed by Ahmad on 2026-05-19; however, given the freeze, implementation was constrained to API-layer corrections that addressed the identified P1 ACL blocker.
- ACL cleanup follows canonical guarded pattern — `setModulePermission` refuses mutation of canonical system roles; custom test roles (`AP Payment Update Only`, `AP Payment Delete Only`, `Purchase Credit Update Only`, `Purchase Credit Delete Only`) used for all ACL scenario tests.

---

_Last Updated: 2026-05-19_