# Story 69-3-d Readiness Coordination — Journal Void/Reversal Evidence Flow

Date: 2026-05-20

## Decision

**NO-GO for Story 69-3-d implementation as initially written. API-contract-first and backoffice UI sub-scopes are GO as of 2026-05-20.**

Story 69-3-c is DONE, and Ahmad recorded Story 69-3-d backoffice unfreeze on 2026-05-20. The generic journal void/reversal API contract blockers were resolved through an API-contract-first implementation and QA re-review GO. Backoffice UI implementation is complete with QA review GO. Ahmad wrote `sign off` on 2026-05-20, so Story 69-3-d may be marked done.

## Unfreeze Update — 2026-05-20

Ahmad wrote `unfreeze` for Story 69-3-d journal void/reversal screens and tests. This resolves the backoffice freeze gate only. It does not resolve API/shared/package contract blockers.

## Readiness Review

- Architecture readiness review task: `ses_1bacdcbbfffeAUH0cU20TgaJZS`
- Decision: NO-GO as written
- Required mode: API-contract-first split/rescope before backoffice UI work

## Blockers

| Severity | Blocker | Evidence |
|----------|---------|----------|
| P1 | Story-level backoffice unfreeze was absent at initial review; now recorded. | Ahmad wrote `unfreeze` on 2026-05-20. API contract blockers remain P1. |
| P1 | Required `POST /api/journals/:id/void` endpoint is missing. | `apps/api/src/routes/journals.ts` exposes list/create/update/post/get routes but no void route. |
| P1 | Shared journal contract lacks void/reversal model. | `packages/shared/src/schemas/journals.ts` currently supports `DRAFT` and `POSTED`; no void reason, voided timestamp, original/reversal link, or voided status fields exist. |
| P1 | Accounting package lacks generic journal void/reversal service. | `packages/modules/accounting/src/journals-service.ts` implements draft/post/list/get flows but no generic void/reversal operation. |
| P1 | DELETE permission semantics are not wired for generic journals. | `apps/api/src/lib/journal-handlers.ts` currently handles create/read/update; `apps/backoffice/src/features/journals-page.tsx` gates READ/CREATE/UPDATE only. |
| P1 | Persistence/cross-link model is unresolved. | `journal_batches` has no void/reversal status or cross-link fields; no additive journal reversal table exists. |
| P1 | Contract-required GET/list voided/reversal fields cannot be returned. | Story requires voided/reversal fields for list/detail, but current response contracts expose draft/posted fields only. |
| P2 | Backoffice UI has no void flow. | `apps/backoffice/src/hooks/use-journals.ts` exposes create/update/post only; `journals-page.tsx` includes post ReviewPanel only. |
| P2 | Test/evidence plan is incomplete for API-contract work. | Story validation commands are backoffice-focused; API/package/shared real-DB tests are required first. |
| P2 | Fixture strategy requires owner-package/API setup decision. | Tests MUST use 69-3-c create/post API flow or owner-package fixtures; no generic reversal fixture exists. |

## API Contract Resolution — 2026-05-20

| Prior Blocker | Resolution Evidence | Result |
|---------------|---------------------|--------|
| Required `POST /api/journals/:id/void` endpoint missing | Runtime and OpenAPI route added in `apps/api/src/routes/journals.ts`; handler added in `apps/api/src/lib/journal-handlers.ts`. | RESOLVED |
| Shared journal contract lacked void/reversal model | `packages/shared/src/schemas/journals.ts` includes `VOIDED`, `REVERSAL`, void reason, voided timestamp, actor, original journal ID, and reversal journal ID fields. | RESOLVED |
| Accounting package lacked generic void/reversal service | `packages/modules/accounting/src/journals-service.ts` implements posted-batch-first target resolution, immutable reversal creation, raw DECIMAL reversal lines, duplicate guard, and stale-service fail-closed API guard support. | RESOLVED |
| DELETE permission semantics missing | Void handler checks `accounting.journals.DELETE`; integration test verifies low-privilege `CASHIER` denial. | RESOLVED |
| Persistence/cross-link model missing | `packages/db/migrations/0213_journal_reversals.sql` adds additive original/reversal cross-link table with unique links and no business trigger. | RESOLVED |
| GET/list void/reversal fields missing | Focused integration test verifies get/list expose voided/reversal status and cross-link fields. | RESOLVED |
| Race/idempotency evidence missing | Focused integration test verifies sequential duplicate void and concurrent duplicate void create exactly one reversal effect. | RESOLVED |
| Runtime stale-service safety missing | `apps/api/__test__/unit/accounting/journals-stale-service.test.ts` verifies stale service fails closed with `SERVICE_VERSION_MISMATCH` and no mutation call. | RESOLVED |

Validation evidence:

- `logs/story-69-3-d-api-validation-r1.exit`: `0`.
- `logs/story-69-3-d-version-guard-validation-r1.exit`: `0`.
- `logs/story-69-3-d-stale-service-test-r1.exit`: `0`.
- QA re-review task `ses_1ba9b57d9ffeUq43DT6VlAv8wQ`: **GO**, no P0/P1 blockers.

## Required Decisions Before Implementation

1. **Unfreeze:** Ahmad/story owner recorded Story 69-3-d backoffice unfreeze on 2026-05-20. UI implementation still MUST wait for API contract completion.
2. **Contract model:** The story MUST define canonical status vocabulary and fields for void/reversal state, including void reason, void timestamp, actor, original journal ID, and reversal journal ID.
3. **Persistence model:** The implementation MUST preserve immutable `journal_batches` and `journal_lines`. An additive cross-link table such as `journal_reversals` / `journal_voids` MUST be evaluated before schema work starts.
4. **API semantics:** The story MUST define deterministic errors for missing journal, already voided journal, invalid reason, invalid state, and permission denial.
5. **Authorization:** Generic journal void MUST require `accounting.journals.DELETE`.
6. **Fixture strategy:** Tests MUST use the 69-3-c create/post API flow for posted journal setup unless an owner-package fixture is added through the accounting package.
7. **Tests:** Real-DB API integration tests MUST exist before backoffice UI tests are treated as sufficient evidence.

## Backoffice UI Resolution — 2026-05-20

| UI Requirement | Resolution Evidence | Result |
|----------------|---------------------|--------|
| Reason capture | `apps/backoffice/src/features/journals-page.tsx` requires a non-empty trimmed reason before ReviewPanel submit. | RESOLVED |
| ReviewPanel evidence | Void ReviewPanel shows before/after status, affected journal ID, reason, totals/lines, expected reversal behavior, and diff evidence. | RESOLVED |
| DELETE permission gate | UI action gates include `accounting.journals.DELETE`; users without DELETE see read-only void messaging. | RESOLVED |
| Reversal/original links | List/detail display backend-provided `reversal_journal_id` and `original_journal_id` as text IDs only. | RESOLVED |
| Deterministic errors | Backoffice maps void/reversal API codes, including already-voided, void-not-allowed, draft-void, forbidden, not-found, and service-version mismatch. | RESOLVED |
| Missing reversal evidence | Targeted P2 fix surfaces `VOID_EVIDENCE_INCOMPLETE` error when a `VOIDED` backend response lacks `reversal_journal_id`. | RESOLVED |

UI validation evidence:

- `logs/story-69-3-d-ui-validation-r1.exit`: `0`.
- `logs/story-69-3-d-ui-p2fix-validation-r1.exit`: `0`.
- QA UI review task `ses_1ba74f11affeGWZEu5fXy3NMhz`: **GO**; targeted P2 re-review returned **GO** with no findings.

## Recommended Split

### 69-3-d-api — Generic Journal Void/Reversal Contract

Scope:
- Add shared schemas/types for journal void/reversal.
- Add accounting package reversal service.
- Add additive persistence/cross-link model if required.
- Add `POST /api/journals/:id/void`.
- Extend `GET /api/journals/:id` and `GET /api/journals` with verified void/reversal fields.
- Add real-DB API integration tests for success, missing reason, 403, 404, 409/422, and reversal linkage.

### 69-3-d-ui — Backoffice Journal Void/Reversal Evidence Flow

Scope:
- Reason capture.
- ReviewPanel before/after evidence.
- DELETE permission gate.
- Reversal/original links from verified contract fields.
- Deterministic 404/409/422 error surfacing.

## Current Next Action

Story 69-3-d is ready to close as done. Reviewer GO and story-owner sign-off are recorded.
