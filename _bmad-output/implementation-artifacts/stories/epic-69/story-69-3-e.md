# Story 69-3-e: Fiscal Period Close UX

Status: done — reviewer GO and owner sign-off recorded

## Readiness Status

- 2026-05-20 architecture readiness review: **NO-GO for implementation as written**.
- Coordination record: `story-69-3-e.readiness-coordination.md`.
- 2026-05-20 implementation update: API contract fixes implemented, validated, reviewed GO (task `ses_1b9e12f59ffeM24KH24R1RiFz1`). Backoffice ReviewPanel UI implemented, validated, reviewed GO (task `ses_1b9c42d77ffe2Q1xsHOTDDqXCS`).
- 2026-05-21 owner sign-off: Ahmad wrote `sign off`; sprint-status.yaml MAY be updated to done using the canonical script.

## Story

As a **financial controller**,  
I want **fiscal period close screens with reason capture and elevated permission enforcement**,  
So that **period closing follows backend fiscal correctness rules with clear evidence and operator accountability**.

## Scope

Implement fiscal year/period list UX, close workflow, elevated permission gating, close reason capture, ReviewPanel evidence, and Epic 32 close response display. This story MUST NOT implement new fiscal close backend logic.

Final scope is fiscal-year close UX using fiscal-year-derived period/status fields. The real fiscal-period list contract remains a follow-up/rescope item and is not a blocker for this implemented slice.

## Dependencies

- 69-3-a Accounting Contract + Fixture Readiness — complete.
- 69-3-c Journal Entry Create/Post Flow — complete.
- Epic 32 fiscal close backend — complete and contract-verified.
- Story 69-1 ReviewPanel staged forms — complete.
- Explicit backoffice unfreeze authorization — recorded 2026-05-20.

## Backoffice Unfreeze Gate

- [x] Explicit unfreeze authorization recorded by story owner for Story 69-3-e — Ahmad wrote `unfreeze fix` on 2026-05-20.
- [x] Authorization scope includes fiscal close readiness/blocker fixes and fiscal period close screens/tests after API contract readiness is achieved.
- [x] Implementation proceeded after API contract readiness was verified (task `ses_1b9e12f59ffeM24KH24R1RiFz1` GO).

### Readiness Findings — Resolved 2026-05-20

| Contract Item | Result |
|---------------|--------|
| Backoffice unfreeze | ✅ Resolved — recorded 2026-05-20. |
| Fiscal year list endpoint | ✅ Resolved — `GET /api/accounts/fiscal-years` verified, correct path used in implementation. |
| Fiscal close endpoint | ✅ Resolved — `POST /api/accounts/fiscal-years/:id/close` (initiate) and `POST /api/accounts/fiscal-years/:id/close/approve` (approve) verified and used. |
| Fiscal status/preview endpoints | ✅ Resolved — `GET /api/accounts/fiscal-years/:id/status` and `GET /api/accounts/fiscal-years/:id/close-preview` verified and used in implementation. |
| Permission semantics | ✅ Resolved — Close and approve routes require `accounting.fiscal_years` **MANAGE**; API and UI permission gates are aligned. |
| Reason persistence | ✅ Resolved — Migration `0214_fiscal_year_close_request_reason.sql` adds `reason` persistence to the existing close-request idempotency table; non-empty reason is enforced by API validation/service flow and verified by integration tests. |
| Fiscal periods | ✅ Resolved — Scope clarified: final scope uses fiscal-year-derived period/status fields only; real fiscal-period list contract is a follow-up rescope item, not a blocker for this slice. |
| Existing UI | ✅ Resolved — `fiscal-years-page.tsx` updated with ReviewPanel and required reason capture. |

### Original Recommended Rescope — Superseded

The original NO-GO split proposal contained three sub-stories (69-3-e1 API contract, 69-3-e2 fiscal period contract, 69-3-e3 UI). This proposal was addressed as follows:

- **69-3-e1 (API contract)**: Resolved inline — endpoint paths corrected, ACL changed to MANAGE, reason persistence added via migration 0214.
- **69-3-e2 (fiscal period)**: Consciously rescoped — final scope uses fiscal-year-derived fields only; real fiscal-period list contract deferred to follow-up.
- **69-3-e3 (UI)**: Implemented and reviewed GO (task `ses_1b9c42d77ffe2Q1xsHOTDDqXCS`).

## Acceptance Criteria

**AC1: Fiscal periods list status**  
Status: ✅ Implemented. `GET /api/accounts/fiscal-years/:id/status` returns fiscal-year-derived period data with status, date boundaries, close eligibility, and close metadata. UI displays this data correctly.

**AC2: Elevated permission gate**  
Status: ✅ Implemented. Close controls are hidden for users lacking `accounting.fiscal_years` MANAGE. Direct API attempts return 403. Unit tests verify permission-aware control rendering.

**AC3: Reason capture and ReviewPanel**  
Status: ✅ Implemented. Required non-empty reason enforced by API validation and UI. ReviewPanel displays close scope, effects, and generated-entry expectations. Persistence via `close_request_id` + `reason` verified by integration tests.

**AC4: Epic 32 close result displayed**  
Status: ✅ Implemented. Approve response includes `postedBatchIds`, `netIncome`, `totalIncome`, `totalExpenses`; UI displays these fields using verified response shapes.

**AC5: Conflict and closed-period errors handled**  
Status: ✅ Implemented. 409/422 error shapes handled deterministically by UI. Integration tests verify conflict and blocked-close error responses.

## API Contract Verification Requirements

| Endpoint | Method | Expected Verification | Result |
|----------|--------|----------------------|--------|
| `/api/accounts/fiscal-years` | GET | List envelope, year fields, status values | ✅ Verified — 3/3 tenant isolation tests pass |
| `/api/accounts/fiscal-years/:id/status` | GET | Close eligibility, close request status, period/status fields | ✅ In fiscal-year-close test suite |
| `/api/accounts/fiscal-years/:id/close-preview` | GET | Generated close-entry preview fields and financial totals | ✅ In fiscal-year-close test suite |
| `/api/accounts/fiscal-years/:id/close` | POST | Initiate close request, reason behavior, permission, 403/409/422 | ✅ Verified — 14/14 tests pass |
| `/api/accounts/fiscal-years/:id/close/approve` | POST | Approve close request, posted batch IDs, status transition | ✅ Verified — 14/14 tests pass |
| `/api/journals/:id` | GET | Generated close-entry display for returned `postedBatchIds` | Not used by this slice — UI displays backend-provided posted batch IDs as text only. |

## Fixture and Test Policy

- Fiscal year/period fixtures owned by `@jurnapod/modules-accounting`.
- Close setup uses production package flow; raw SQL not used for setup.
- Integration tests use real DB.
- Unit tests cover close eligibility view-models and ReviewPanel evidence formatting.
- Negative auth tests use low-privilege/custom role lacking `accounting.fiscal_years` MANAGE.

**Note on integration test coverage**: No separate backoffice integration test suite was added because the API integration test suite (`fiscal-year-close.test.ts`, 14/14 tests) provides comprehensive coverage of the close contract end-to-end, including success paths, permission denial (403), reason validation, conflict states (409), and blocked-close (422). Unit tests for the UI component cover the view-model and permission-gate logic. This satisfies the implemented scope.

## Required Validation Evidence

```bash
# API validation (story-69-3-e-contract-validation-r2)
# Exit code: 0
# Log: logs/story-69-3-e-contract-validation-r2.log

npm run build -w @jurnapod/db                          # ✅ pass
npm run build -w @jurnapod/modules-accounting           # ✅ pass
npm run build:libs                                      # ✅ pass
npm run typecheck -w @jurnapod/api                      # ✅ pass (0 errors)
npm run lint -w @jurnapod/api                           # ✅ pass (0 errors, 163 warnings pre-existing)
npm run lint:migrations                                 # ✅ pass
npm run lint:fixture-flow                              # ✅ pass (236 files)
npm run test:single -w @jurnapod/api -- __test__/integration/accounting/fiscal-year-close.test.ts       # ✅ 14/14 pass
npm run test:single -w @jurnapod/api -- __test__/integration/accounting/fiscal-year-list-tenant-isolation.test.ts  # ✅ 3/3 pass

# Backoffice validation (story-69-3-e-backoffice-validation-r2)
# Exit code: 0
# Log: logs/story-69-3-e-backoffice-validation-r2.log

npm run test:single -w @jurnapod/backoffice -- __test__/unit/features/fiscal-years-page.test.tsx         # ✅ 6/6 pass
npm run typecheck -w @jurnapod/backoffice               # ✅ pass
npm run build -w @jurnapod/backoffice                   # ✅ pass

# Backoffice lint (story-69-3-e-backoffice-lint-r1)
# Exit code: 0

npm run lint -w @jurnapod/backoffice                    # ✅ pass
```

## Tasks / Subtasks

- [x] Implement fiscal period/year list and status indicators.
- [x] Implement close eligibility and permission-aware controls.
- [x] Implement close reason form and ReviewPanel evidence.
- [x] Display generated close-entry references using verified fields.
- [x] Add API integration tests for fiscal-year-close contract (14/14 pass).
- [x] Add unit tests for fiscal-years-page view-models and permission gates (6/6 pass).
- [x] API lint/typecheck/build:libs passes.
- [x] Backoffice typecheck/build passes.

## Review Sign-off

- API review task `ses_1b9e12f59ffeM24KH24R1RiFz1`: **GO** (P2/P3 fixes resolved).
- UI review task `ses_1b9c42d77ffe2Q1xsHOTDDqXCS`: **GO**, no blockers.
- Owner sign-off: Ahmad wrote `sign off` on 2026-05-21.

## Story Done Authority

The implementing developer MUST NOT mark this story done without reviewer GO, story owner explicit sign-off, and `story-69-3-e.completion.md` with evidence. Reviewer GO and owner sign-off are recorded. Sprint-status.yaml MUST be updated using the canonical script.
