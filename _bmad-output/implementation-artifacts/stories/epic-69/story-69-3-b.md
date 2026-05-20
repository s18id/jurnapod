# Story 69-3-b: Chart of Accounts Screens

Status: done

## Implementation Sign-Offs

- Backoffice unfreeze: Ahmad wrote `unfreeze` on 2026-05-20 for Story 69-3-b chart-of-accounts screens and tests.
- Story owner sign-off: Ahmad wrote `sign-off` on 2026-05-20 after reviewer GO.

## Story

As an **accountant**,  
I want **chart of accounts screens with hierarchy, edit flows, and account history**,  
So that **I can maintain GL account structure with permission-aware controls and financial-grade review steps**.

## Scope

Implement the backoffice chart of accounts UI only after Story 69-3-a verifies contracts and readiness. This slice includes account list/tree, flat list toggle, create/edit ReviewPanel flow, account detail drawer, and deterministic unavailable-state messaging for history/balance fields that are not exposed by verified account contracts.

## Dependencies

- 69-3-a Accounting Contract + Fixture Readiness — complete and signed off.
- Story 69-1 ReviewPanel staged forms — MUST be complete.
- Epic 65 typed API client and shared admin primitives — MUST be complete.
- Epic 66 permission-aware navigation — MUST be complete.
- Explicit backoffice unfreeze authorization — MUST be recorded in this story before implementation.

## Backoffice Unfreeze Gate

- [x] Explicit unfreeze authorization recorded by story owner for Story 69-3-b — Ahmad wrote `unfreeze` on 2026-05-20.
- [x] Authorization scope includes `apps/backoffice` account screens and tests.
- [x] If authorization is absent, implementation MUST NOT start — authorization is recorded.

## Acceptance Criteria

**AC1: Account tree and flat list**  
Given the chart of accounts page, when data loads, then the UI shows hierarchy with type badges, active status, and a flat list toggle for search/filter workflows. The UI MUST NOT display fabricated current balance values because account contracts do not expose balances.

**AC2: Create/edit account ReviewPanel**  
Given a user with `accounting.accounts` CREATE/UPDATE permission, when creating or editing an account, then the staged form uses ReviewPanel and displays before/after review data before submission.

**AC3: Permission-aware controls**  
Given a user without required account permissions, when the page loads, then create/edit controls are hidden or disabled and direct API attempts return 403.

**AC4: Account detail/history**  
Given an account is selected, when the detail drawer opens, then account metadata is shown from `GET /api/accounts/:id`. Journal-line history is scoped out for this story; the UI MUST show a deterministic "history unavailable in this slice" state and MUST NOT fetch unverified journal history.

**AC5: Empty and error states**  
Given no accounts or a failed load, when the page renders, then deterministic empty/error states are shown without fabricated balances.

## API Contract Verification Requirements

Story 69-3-a MUST verify these before implementation starts; this story MUST re-check during implementation:

| Endpoint | Method | Expected Verification | Result |
|----------|--------|----------------------|--------|
| `/api/accounts` | GET | Response envelope, type/status fields, filtering behavior | Verified in 69-3-a. Returns flat account array; no pagination and no balance fields. |
| `/api/accounts/tree` | GET | Hierarchy fields, active/inactive behavior | Verified in 69-3-a. This is the canonical hierarchy endpoint for tree view. |
| `/api/accounts` | POST | Request schema, ReviewPanel submission shape, created account response | Verified in 69-3-a. UI MUST send authenticated tenant company only; API rejects mismatch. |
| `/api/accounts/:id` | PUT | Update schema, immutable fields, edited account response | Verified and fixed after 69-3-a. PATCH does not exist. PUT update persistence, missing-account 404, and in-use `is_active:false` 409 are covered by `apps/api/__test__/integration/accounts/update.test.ts`. |
| `/api/accounts/:id` | GET | Detail availability and error shape | Verified in 69-3-a. Journal-line history is not available from account detail and MUST be scoped out or fetched through verified journal query in this story. |

## Readiness Gate Corrections Required Before Implementation

| Gate | Requirement | Status |
|------|-------------|--------|
| Backoffice unfreeze | Ahmad MUST explicitly authorize Story 69-3-b `apps/backoffice` account screens and tests before implementation starts. | closed — authorization recorded |
| Route metadata | `/chart-of-accounts` route metadata MUST use resource permission `accounting.accounts.READ`; role-only access is insufficient for Epic 66. | closed — metadata added |
| Action permissions | Create controls MUST require `accounting.accounts.CREATE`; edit controls MUST require `accounting.accounts.UPDATE`; direct API denial coverage MUST use non-privileged personas. | closed — UI gating and role-boundary evidence added |
| Typed API alignment | Implementation MUST use verified paths `GET /accounts`, `GET /accounts/tree`, `GET /accounts/:id`, `POST /accounts`, and `PUT /accounts/:id`. If generated schema lacks `/accounts/tree` or PUT, implementation MUST use a documented temporary `apiRequest` bridge with shared contract types. | closed — screen uses verified account hook bridge and PUT update |
| Legacy account hooks | Unsupported legacy calls (`DELETE /accounts/:id`, `POST /accounts/:id/reactivate`, `/usage`) MUST be removed, disabled, or scoped out when the account area is touched. | closed — unsupported account hook exports removed |
| Balance scope | Balance fields are not available from verified account contracts. UI MUST omit balance columns/cards and MUST NOT display zero as a placeholder balance. | corrected |
| History scope | Journal-line history is not available from account detail. Story 69-3-b MUST scope history out and render a deterministic unavailable state. | corrected |

## Readiness Notes from 69-3-a / Follow-up Fix

- Account update API blocker is resolved: `AccountsService.updateAccount()` now uses parameterized Kysely update execution instead of broken raw placeholder SQL.
- Active-state safety blocker is resolved for PUT: `is_active:false` now checks existing account usage and maps `AccountInUseError` to `409 ACCOUNT_IN_USE`.
- Actual update method is `PUT /api/accounts/:id`; Story 69-3-b UI MUST NOT call PATCH unless backend support is explicitly added first.
- Account balances are not returned by account list/detail endpoints. UI MUST NOT fabricate balances. Balance display MAY be omitted in this slice or added only after verified backend support exists.
- Account journal-line history is not returned by account detail. UI MUST scope out history in this story and MUST NOT call `GET /api/journals?account_id=...` unless a separate story verifies that contract and `accounting.journals.READ` permission behavior.

### API Fix Evidence

| Check | Result | Evidence |
|-------|--------|----------|
| Modules accounting build | Passed | `logs/story-69-3-b-account-update-modules-accounting-build-r1.log`, exit `0` |
| Build libs | Passed | `logs/story-69-3-b-account-update-build-libs-r1.log`, exit `0` |
| Account update API tests | Passed — 3 tests | `logs/story-69-3-b-account-update-api-test-r3.log`, exit `0` |
| API typecheck | Passed | `logs/story-69-3-b-account-update-api-typecheck-r1.log`, exit `0` |
| Fixture-flow lint | Passed | `logs/story-69-3-b-account-update-fixture-flow-r1.log`, exit `0` |
| API lint | Passed with pre-existing warnings | `logs/story-69-3-b-account-update-api-lint-r1.log`, exit `0` |
| QA review | GO — no P0/P1/P2 findings | `review-account-update-fix-69-3-b` |

## Fixture and Test Policy

- Account fixtures MUST come from `@jurnapod/modules-accounting` owner-package fixtures or verified transitional re-export wrappers.
- Tests MUST NOT use raw SQL `INSERT`/`UPDATE` for setup.
- Integration tests MUST use real DB and live API boundaries.
- Unit tests MAY cover tree/flat transforms and ReviewPanel view-model logic without DB.
- Negative auth tests MUST use `CASHIER` or a low-privilege custom role.

### Permission Persona Matrix

| Persona | Permissions | Required Assertions |
|---------|-------------|---------------------|
| OWNER or custom full account role | `accounting.accounts.READ/CREATE/UPDATE` | Can load route, create account, edit account through PUT, and see ReviewPanel submit actions. |
| Read-only accounting role | `accounting.accounts.READ` only | Can load account list/detail; create/edit controls are hidden or disabled; direct POST/PUT returns 403. |
| CASHIER | No accounting account permission | Route/navigation is denied or hidden; direct GET/POST/PUT account API calls return 403. |

### Scenario Coverage Matrix

| AC | Scenario | Test Type | Required Evidence |
|----|----------|-----------|-------------------|
| AC1 | Tree loads from `GET /accounts/tree`; flat toggle uses `GET /accounts`; filters/search serialize only verified params. | Unit + live API integration | Tree/flat transform unit test plus integration query assertion. |
| AC1 | Balance fields are absent; UI omits balances and never displays fabricated zero balances. | Unit | Render assertion for absence of balance column/card. |
| AC2 | Create form uses ReviewPanel, account type selector, final review, and `POST /accounts`. | Unit + live API integration | ReviewPanel render and request contract assertion. |
| AC2 | Edit form uses ReviewPanel, before/after diff, and `PUT /accounts/:id`; PATCH is never called. | Unit + live API integration | API helper test locks method to PUT. |
| AC3 | Read-only role can view list/detail but cannot create/edit. | Unit + live API integration | Permission rendering and direct API 403. |
| AC3 | CASHIER cannot access route data or direct APIs. | Live API integration | Direct API 403 checks using CASHIER. |
| AC4 | Detail drawer displays verified account metadata only. | Unit | Detail render assertion from `GET /accounts/:id` contract fields. |
| AC4 | History is scoped out and shows deterministic unavailable state without journal fetch. | Unit | Assert unavailable message and no journal API call. |
| AC5 | Empty account list renders deterministic empty state. | Unit | Empty state assertion. |
| AC5 | API errors `DUPLICATE_CODE`, `INVALID_PARENT`, `INVALID_ACCOUNT_TYPE`, `CIRCULAR_REFERENCE`, `NOT_FOUND`, `ACCOUNT_IN_USE` are mapped by status/code. | Unit + live API integration | Error mapping tests and selected API regression checks. |

### Fixture Matrix

| Fixture Need | Source | Notes |
|--------------|--------|-------|
| Company and users | `apps/api/__test__/fixtures` platform wrappers | Use owner/full role, read-only custom role, and CASHIER. |
| Account hierarchy | `@jurnapod/modules-accounting/test-fixtures:createTestAccount` through API fixture wrapper | Parent/child accounts for tree and in-use active-state behavior. |
| Empty state | Fresh test company with no custom accounts beyond seed baseline filtering strategy | Test MUST avoid raw deletes of seeded/reference accounts. |
| In-use account | Parent with active child account for `ACCOUNT_IN_USE`, or owner-package journal fixture if journal usage is required | Existing API blocker test covers active-child path. |

## Required Validation Evidence with PID/Log Tracking

```bash
nohup npm run test:single -w @jurnapod/backoffice -- __test__/integration/accounting/accounts-screen.test.ts > logs/story-69-3-b-accounts-integration.log 2>&1 & echo $! > logs/story-69-3-b-accounts-integration.pid
while kill -0 $(cat logs/story-69-3-b-accounts-integration.pid) 2>/dev/null; do sleep 5; done
nohup npm run test:single -w @jurnapod/backoffice -- __test__/unit/accounting/accounts-screen.test.ts > logs/story-69-3-b-accounts-unit.log 2>&1 & echo $! > logs/story-69-3-b-accounts-unit.pid
while kill -0 $(cat logs/story-69-3-b-accounts-unit.pid) 2>/dev/null; do sleep 5; done
nohup npm run typecheck -w @jurnapod/backoffice > logs/story-69-3-b-backoffice-typecheck.log 2>&1 & echo $! > logs/story-69-3-b-backoffice-typecheck.pid
while kill -0 $(cat logs/story-69-3-b-backoffice-typecheck.pid) 2>/dev/null; do sleep 5; done
nohup npm run lint -w @jurnapod/backoffice > logs/story-69-3-b-backoffice-lint.log 2>&1 & echo $! > logs/story-69-3-b-backoffice-lint.pid
while kill -0 $(cat logs/story-69-3-b-backoffice-lint.pid) 2>/dev/null; do sleep 5; done
nohup npm run build -w @jurnapod/backoffice > logs/story-69-3-b-backoffice-build.log 2>&1 & echo $! > logs/story-69-3-b-backoffice-build.pid
while kill -0 $(cat logs/story-69-3-b-backoffice-build.pid) 2>/dev/null; do sleep 5; done
nohup npm run test:single -w @jurnapod/api -- __test__/integration/accounts/update.test.ts > logs/story-69-3-b-account-update-api-test.log 2>&1 & echo $! > logs/story-69-3-b-account-update-api-test.pid
while kill -0 $(cat logs/story-69-3-b-account-update-api-test.pid) 2>/dev/null; do sleep 5; done
```

Each validation log MUST have a corresponding `.exit` file or recorded exit-code evidence in the completion report.

## Tasks / Subtasks

- [x] Add accounts route and navigation only after permission gate is verified.
- [x] Implement account list with tree/flat toggle.
- [x] Implement create/edit form with ReviewPanel.
- [x] Implement account detail panel with verified account fields and deterministic history-unavailable state.
- [x] Add unit tests for route metadata, endpoint methods, ReviewPanel scope messaging, and permission rendering.
- [x] Re-run API integration coverage for PUT update and accounting role-boundary 403 behavior.

## Implementation Evidence — 2026-05-20

### Files Modified / Created

- `apps/backoffice/src/app/routes.ts` — added `/chart-of-accounts` `accounting.accounts.READ` route permission metadata.
- `apps/backoffice/src/features/accounts-page.tsx` — added permission-aware tree/flat account screen, ReviewPanel-backed create/edit flow, PUT-based edit submission, deterministic journal-history unavailable state, and no-read route denial.
- `apps/backoffice/src/hooks/use-accounts.ts` — removed unsupported account usage/deactivate/reactivate calls from the account hook surface and added enabled guards for account tree/type fetches.
- `apps/backoffice/__test__/unit/features/accounts-screen.test.tsx` — added focused unit coverage for route metadata, account API methods, ReviewPanel/account UI scope, no fabricated journal links, and permission gating.

### Acceptance Criteria Evidence

| AC | Result | Evidence |
|----|--------|----------|
| AC1 | Implemented | Account screen renders backend tree data with tree/flat toggle and no balance amount column/card. Unit evidence: `logs/story-69-3-b-backoffice-accounts-test-r4.log` (5/5 passed). |
| AC2 | Implemented | Create/edit uses `ReviewPanel`; create calls `POST /accounts`; edit calls `PUT /accounts/:id` and test asserts PATCH is not used. Evidence: `apps/backoffice/__test__/unit/features/accounts-screen.test.tsx`, `logs/story-69-3-b-backoffice-accounts-test-r4.log`. |
| AC3 | Implemented | Route requires `accounting.accounts.READ`; UI hides create for READ-only, disables edit without UPDATE, and denies no-read users before account hooks fetch. API role boundary re-run passed: `logs/story-69-3-b-role-boundary-accounting-r1.log`. |
| AC4 | Implemented | Detail panel displays verified account metadata only. Journal-line history shows deterministic unavailable messaging and no journal/audit links are rendered. Evidence: `logs/story-69-3-b-backoffice-accounts-test-r4.log`. |
| AC5 | Implemented | Existing deterministic empty/error states remain; error mapping covers duplicate, invalid parent/type, circular reference, not found, account in use, and forbidden cases. Evidence: `apps/backoffice/src/features/accounts-page.tsx`, `logs/story-69-3-b-backoffice-accounts-test-r4.log`. |

### Validation Evidence

| Check | Result | Evidence |
|-------|--------|----------|
| Backoffice account screen focused unit test | Passed — 5 tests | `logs/story-69-3-b-backoffice-accounts-test-r4.log`, exit `0` |
| Backoffice typecheck | Passed | `logs/story-69-3-b-backoffice-typecheck-r2.log`, exit `0` |
| Backoffice lint | Passed | `logs/story-69-3-b-backoffice-lint-r2.log`, exit `0` |
| Backoffice build | Passed with existing bundle warnings | `logs/story-69-3-b-backoffice-build-r2.log`, exit `0` |
| API account update integration test | Passed — 3 tests | `logs/story-69-3-b-api-account-update-r1.log`, exit `0` |
| API accounting role-boundary integration test | Passed | `logs/story-69-3-b-role-boundary-accounting-r1.log`, exit `0` |
| Fixture-flow lint | Passed | `logs/story-69-3-b-fixture-flow-r1.log`, exit `0` |
| Sprint status validation | Passed | `logs/story-69-3-b-sprint-status-validate-r1.log`, exit `0` |
| Diff whitespace check | Passed | `logs/story-69-3-b-diff-check-r2.log`, exit `0` |

### Review Evidence

- QA/code review: GO, no P0/P1/P2 findings. Initial P3 stale-detail concern was fixed by rebinding selected account state from the saved create/update response.
- Targeted re-review: GO; prior P3 resolved. Task session: `ses_1bc8a2bbdffeZBlUtMkPk1bUCW`.

## Story Done Authority

The implementing developer MUST NOT mark this story done. Done requires reviewer GO, story owner explicit sign-off, and `story-69-3-b.completion.md` with evidence.
