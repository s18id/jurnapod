# Story 69-3-e: Fiscal Period Close UX

Status: backlog

## Story

As a **financial controller**,  
I want **fiscal period close screens with reason capture and elevated permission enforcement**,  
So that **period closing follows backend fiscal correctness rules with clear evidence and operator accountability**.

## Scope

Implement fiscal year/period list UX, close workflow, elevated permission gating, close reason capture, ReviewPanel evidence, and Epic 32 close response display. This story MUST NOT implement new fiscal close backend logic.

## Dependencies

- 69-3-a Accounting Contract + Fixture Readiness — MUST be complete or explicitly signed off for this slice.
- 69-3-c Journal Entry Create/Post Flow — MUST be complete if close evidence links to generated journals.
- Epic 32 fiscal close backend — MUST be complete and contract-verified.
- Story 69-1 ReviewPanel staged forms — MUST be complete.
- Explicit backoffice unfreeze authorization — MUST be recorded in this story before implementation.

## Backoffice Unfreeze Gate

- [ ] Explicit unfreeze authorization recorded by story owner for Story 69-3-e.
- [ ] Authorization scope includes fiscal period close screens and tests.
- [ ] If authorization is absent, implementation MUST NOT start.

## Acceptance Criteria

**AC1: Fiscal periods list status**  
Given the fiscal period page, when data loads, then periods/fiscal years display status, date boundaries, close eligibility, and close metadata based on verified API fields.

**AC2: Elevated permission gate**  
Given a user lacks `accounting.fiscal_years` MANAGE permission, when close controls render, then controls are hidden/disabled and direct API attempts return 403.

**AC3: Reason capture and ReviewPanel**  
Given a permitted user initiates close, when confirmation starts, then a non-empty reason is required and ReviewPanel displays close scope, effects, and generated-entry expectations.

**AC4: Epic 32 close result displayed**  
Given close succeeds, when response is shown, then 3-step close entries or verified generated journal references are visible without fabricating missing fields.

**AC5: Conflict and closed-period errors handled**  
Given a period is already closed or blocked, when close is attempted, then 409/422 errors are shown deterministically.

## API Contract Verification Requirements

| Endpoint | Method | Expected Verification | Result |
|----------|--------|----------------------|--------|
| `/api/fiscal-years` | GET | List envelope, period/year fields, status values, eligibility fields | TBD |
| `/api/fiscal-years/:id/close` | POST | Reason payload, permission requirement, generated entries, status response, 403/409/422 shapes | TBD |
| `/api/journals/:id` | GET | Generated close-entry link display fields if exposed | TBD |

## Fixture and Test Policy

- Fiscal year/period fixtures MUST be owned by `@jurnapod/modules-accounting` or verified canonical wrappers.
- Close setup MUST use production package flow and MUST NOT use raw SQL to force closed state except read-only verification/teardown.
- Integration tests MUST use real DB.
- Unit tests MAY cover close eligibility view-models and ReviewPanel evidence formatting.
- Negative auth tests MUST use a low-privilege role lacking `accounting.fiscal_years` MANAGE.

## Required Validation Evidence with PID/Log Tracking

```bash
nohup npm run test:single -w @jurnapod/backoffice -- __test__/integration/accounting/fiscal-period-close.test.ts > logs/story-69-3-e-period-close-integration.log 2>&1 & echo $! > logs/story-69-3-e-period-close-integration.pid
nohup npm run test:single -w @jurnapod/backoffice -- __test__/unit/accounting/fiscal-period-close.test.ts > logs/story-69-3-e-period-close-unit.log 2>&1 & echo $! > logs/story-69-3-e-period-close-unit.pid
nohup npm run typecheck -w @jurnapod/backoffice > logs/story-69-3-e-backoffice-typecheck.log 2>&1 & echo $! > logs/story-69-3-e-backoffice-typecheck.pid
nohup npm run build -w @jurnapod/backoffice > logs/story-69-3-e-backoffice-build.log 2>&1 & echo $! > logs/story-69-3-e-backoffice-build.pid
```

## Tasks / Subtasks

- [ ] Implement fiscal period/year list and status indicators.
- [ ] Implement close eligibility and permission-aware controls.
- [ ] Implement close reason form and ReviewPanel evidence.
- [ ] Display generated close-entry references using verified fields.
- [ ] Add integration tests for success, 403, missing reason, already-closed conflict, and blocked close.
- [ ] Add unit tests for eligibility/evidence view-models.

## Story Done Authority

The implementing developer MUST NOT mark this story done. Done requires reviewer GO, story owner explicit sign-off, and `story-69-3-e.completion.md` with evidence.
