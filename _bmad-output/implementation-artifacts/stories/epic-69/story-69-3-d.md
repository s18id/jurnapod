# Story 69-3-d: Journal Void/Reversal Evidence Flow

Status: backlog

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

- [ ] Explicit unfreeze authorization recorded by story owner for Story 69-3-d.
- [ ] Authorization scope includes journal void/reversal screens and tests.
- [ ] If authorization is absent, implementation MUST NOT start.

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

- [ ] Add void action only for eligible posted journals.
- [ ] Implement reason capture and ReviewPanel evidence.
- [ ] Display reversal/original cross-links.
- [ ] Add status gating for posted/voided journals.
- [ ] Add integration tests for success, missing reason, 403, 404, 409/422 paths.
- [ ] Add unit tests for diff/evidence view-model.

## Story Done Authority

The implementing developer MUST NOT mark this story done. Done requires reviewer GO, story owner explicit sign-off, and `story-69-3-d.completion.md` with evidence.
