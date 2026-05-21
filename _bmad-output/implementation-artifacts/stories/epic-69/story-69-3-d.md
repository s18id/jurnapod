# Story 69-3-d: Journal Void/Reversal Evidence Flow

Status: done

## Readiness Status

- 2026-05-20 architecture readiness review: **NO-GO for implementation as written**.
- Coordination record: `story-69-3-d.readiness-coordination.md`.
- Primary reason at initial review: required generic journal void/reversal API contract was missing.
- 2026-05-20 API-contract-first blocker fix: **GO for API contract sub-scope** after QA re-review.
- 2026-05-20 backoffice UI implementation: **GO after QA review and targeted P2 fix re-review**.
- 2026-05-20 owner sign-off: Ahmad wrote `sign off`; story may be marked done.

## Implementation Sign-Offs

- Backoffice unfreeze: Ahmad wrote `unfreeze` on 2026-05-20 for Story 69-3-d journal void/reversal screens and tests.
- Reviewer GO: QA review task `ses_1ba74f11affeGWZEu5fXy3NMhz` returned GO after targeted P2 fix verification.
- Owner sign-off: Ahmad wrote `sign off` on 2026-05-20.

## Story

As an **accountant or controller**,  
I want **journal void and reversal evidence flows**,  
So that **posted journal corrections preserve immutability, reversal traceability, and audit-grade reason capture**.

## Scope

Implement UI for voiding posted journals with reason, ReviewPanel before/after evidence, reversal cross-links, immutable posted-record handling, and conflict/error states. This story MUST NOT silently mutate posted journals.

## Dependencies

- 69-3-a Accounting Contract + Fixture Readiness — MUST be complete or explicitly signed off for this slice.
- 69-3-c Journal Entry Create/Post Flow — MUST be complete.
- Story 69-1 ReviewPanel staged forms — MUST be complete.
- Explicit backoffice unfreeze authorization — MUST be recorded in this story before implementation.

## Backoffice Unfreeze Gate

- [x] Explicit unfreeze authorization recorded by story owner for Story 69-3-d — Ahmad wrote `unfreeze` on 2026-05-20.
- [x] Authorization scope includes journal void/reversal screens and tests.
- [x] If authorization is absent, implementation MUST NOT start — authorization is recorded; API contract blockers still prevent implementation as written.

## Acceptance Criteria

**AC1: Void action requires permission and reason**  
Given a posted journal, when a permitted user initiates void, then the UI requires a non-empty reason and verifies `accounting.journals` DELETE permission semantics.

**AC2: ReviewPanel evidence is complete**  
Given void confirmation starts, when ReviewPanel renders, then before/after status, reason, affected journal ID, and expected reversal behavior are visible before submission.

**AC3: Reversal cross-link displayed**  
Given void succeeds, when the journal detail renders, then original and reversal journal links are visible using verified contract fields.

**AC4: Posted records remain immutable**  
Given a posted or voided journal, when the user views details, then mutation controls remain unavailable except allowed reversal/void actions.

**AC5: Conflict and not-found errors are deterministic**  
Given a stale UI attempts to void an already-voided or missing journal, when the API responds, then 404/409/422 errors are surfaced with actionable messages.

## API Contract Verification Requirements

| Endpoint | Method | Expected Verification | Result |
|----------|--------|----------------------|--------|
| `/api/journals/:id` | GET | Posted/voided status fields, reversal link fields, audit metadata | TBD |
| `/api/journals/:id/void` | POST | Reason payload, permission requirement, voided response shape, reversal ID/cross-link shape | TBD |
| `/api/journals` | GET | List display for voided/reversal journals and filters | TBD |

### API Contract Verification Update — 2026-05-20

| Endpoint | Method | Verification Evidence | Result |
|----------|--------|-----------------------|--------|
| `/api/journals/:id` | GET | `apps/api/__test__/integration/journals/void-reversal.test.ts` verifies original journal returns `VOIDED`, reversal journal returns `REVERSAL`, and original/reversal cross-link fields are exposed. | PASS |
| `/api/journals/:id/void` | POST | Focused integration test verifies required non-empty reason, `accounting.journals.DELETE` permission, deterministic 404/409/error states, no draft void, no duplicate financial effect, and concurrent duplicate-void serialization. | PASS |
| `/api/journals` | GET | Focused integration test verifies voided original appears in list response with reversal link fields. | PASS |

API validation evidence:

- `logs/story-69-3-d-api-validation-r1.exit`: `0` — shared build, db build, modules-accounting build, API typecheck, API lint, fixture-flow lint, migration lint, void-reversal integration, draft-flow regression, and `git diff --check` passed.
- `logs/story-69-3-d-version-guard-validation-r1.exit`: `0` — modules-accounting build, API typecheck, void-reversal integration, and `git diff --check` passed after stale-service fail-closed guard.
- `logs/story-69-3-d-stale-service-test-r1.exit`: `0` — stale-service unit regression, void-reversal integration, API typecheck, and `git diff --check` passed.
- QA re-review task `ses_1ba9b57d9ffeUq43DT6VlAv8wQ`: **GO**, no P0/P1 blockers after P3 stale-service regression coverage was added.

### Backoffice UI Verification Update — 2026-05-20

| Acceptance Area | Verification Evidence | Result |
|-----------------|-----------------------|--------|
| DELETE permission + reason gate | Backoffice unit test verifies DELETE-gated void action and missing-reversal evidence helper; UI requires non-empty trimmed reason before submit. | PASS |
| ReviewPanel evidence | `apps/backoffice/src/features/journals-page.tsx` renders void before/after sections, affected journal ID, reason, totals, lines, backend reversal semantics, diff evidence, and final confirmation checkbox through `ReviewPanel`. | PASS |
| Reversal/original metadata display | List/detail display `void_reason`, `voided_at`, `voided_by_user_id`, `reversal_journal_id`, and `original_journal_id` as backend-provided text IDs only. | PASS |
| Immutable finalized states | DRAFT remains editable; POSTED/VOIDED/REVERSAL render read-only detail. Void action is limited to `POSTED` + `MANUAL`. | PASS |
| Deterministic errors | `formatJournalApiError()` maps void/reversal errors including already-voided, not-allowed, draft-void, forbidden, not-found, and service-version mismatch. | PASS |

UI validation evidence:

- `logs/story-69-3-d-ui-validation-r1.exit`: `0` — focused backoffice journal unit test 9/9, backoffice typecheck, lint, build, API void-reversal integration 7/7, and `git diff --check` passed.
- `logs/story-69-3-d-ui-p2fix-validation-r1.exit`: `0` — focused backoffice journal unit test 10/10, backoffice typecheck, lint, and `git diff --check` passed.
- QA UI review task `ses_1ba74f11affeGWZEu5fXy3NMhz`: initial GO with a P2 follow-up; targeted re-review returned **GO** with no findings after incomplete reversal evidence was changed from success to error.

### Readiness Findings — 2026-05-20

| Contract Item | Result |
|---------------|--------|
| Backoffice unfreeze | Recorded on 2026-05-20; API contract blockers still prevent implementation as written. |
| `POST /api/journals/:id/void` | Missing; generic journal routes expose list/create/update/post/get only. |
| Shared journal void/reversal schema | Missing; current journal status contract supports `DRAFT` and `POSTED` only. |
| Accounting package void/reversal service | Missing; journal service supports draft/post/list/get only. |
| DELETE permission handling | Missing for generic journals; current handler/UI action gates cover READ/CREATE/UPDATE only. |
| Persistence cross-link model | Missing; no additive generic journal void/reversal table or response field model is defined. |

### API Blocker Resolution — 2026-05-20

| Prior Blocker | Resolution |
|---------------|------------|
| `POST /api/journals/:id/void` missing | Added runtime and OpenAPI route for generic manual posted journal void. |
| Shared void/reversal schema missing | Added `VOIDED` and `REVERSAL` posted statuses plus void reason, voided timestamp, actor, original journal ID, and reversal journal ID fields. |
| Accounting void/reversal service missing | Added package service flow that resolves posted batch IDs first, creates balanced reversal journals, and preserves immutable original posted rows. |
| DELETE permission missing | Void handler requires `accounting.journals.DELETE` with outlet-aware permission check. |
| Persistence cross-link missing | Added additive `journal_reversals` table with original/reversal unique links. No business trigger was added. |
| Duplicate/race safety missing | Added unique-link persistence, transaction locking, sequential duplicate test, and concurrent duplicate-void integration test. |
| Stale service runtime safety missing | Added fail-closed `SERVICE_VERSION_MISMATCH` guard and unit regression coverage. |

### Recommended Rescope — 2026-05-20

Story 69-3-d MUST be split into:

1. `69-3-d-api` — generic journal void/reversal API contract, shared schemas, accounting package service, additive persistence model, and real-DB API integration tests.
2. `69-3-d-ui` — backoffice reason capture, ReviewPanel evidence, DELETE permission gate, reversal/original link display, and deterministic error surfacing after API contract completion. Story-level unfreeze is already recorded for UI scope.

## Fixture and Test Policy

- Posted journal fixtures MUST use canonical accounting package flows.
- Void/reversal setup MUST NOT use raw SQL to bypass domain invariants.
- Integration tests MUST use real DB and verify original/reversal linkage through API or read-only DB verification.
- Unit tests MAY cover ReviewPanel diff view-model and status gating.
- Negative auth tests MUST use `CASHIER` or a low-privilege role lacking `accounting.journals` DELETE.

## Required Validation Evidence with PID/Log Tracking

```bash
nohup npm run test:single -w @jurnapod/backoffice -- __test__/integration/accounting/journal-void-reversal.test.ts > logs/story-69-3-d-journal-void-integration.log 2>&1 & echo $! > logs/story-69-3-d-journal-void-integration.pid
nohup npm run test:single -w @jurnapod/backoffice -- __test__/unit/accounting/journal-void-review.test.ts > logs/story-69-3-d-journal-void-unit.log 2>&1 & echo $! > logs/story-69-3-d-journal-void-unit.pid
nohup npm run typecheck -w @jurnapod/backoffice > logs/story-69-3-d-backoffice-typecheck.log 2>&1 & echo $! > logs/story-69-3-d-backoffice-typecheck.pid
nohup npm run build -w @jurnapod/backoffice > logs/story-69-3-d-backoffice-build.log 2>&1 & echo $! > logs/story-69-3-d-backoffice-build.pid
```

## Tasks / Subtasks

- [x] Add void action only for eligible posted journals.
- [x] Implement reason capture and ReviewPanel evidence.
- [x] Display reversal/original cross-links.
- [x] Add status gating for posted/voided/reversal journals.
- [x] Add API integration tests for success, missing reason, 403, 404, duplicate/conflict, not-found, draft rejection, stale-service guard, and concurrent duplicate void.
- [x] Add unit tests for diff/evidence view-model and UI permission/status gates.

## Story Done Authority

The implementing developer MUST NOT mark this story done without reviewer GO, story owner explicit sign-off, and `story-69-3-d.completion.md` with evidence. These requirements are complete for Story 69-3-d as of 2026-05-20.
