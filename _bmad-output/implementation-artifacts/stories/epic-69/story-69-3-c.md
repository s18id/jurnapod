# Story 69-3-c: Journal Entry Create/Post Flow

Status: done

## Readiness Status

- 2026-05-20 architecture readiness review: **NO-GO for implementation as written**.
- Coordination record: `story-69-3-c.readiness-coordination.md`.
- Primary reason: current API supports only journal list/create/get for immediate posted journal batches; it does not support draft edit/post lifecycle required by this story.
- Backoffice unfreeze is recorded, but implementation MUST NOT start as written until the API contract blockers are resolved or the story is explicitly rescoped.
- 2026-05-20 API blocker implementation update: journal draft/create/update/post contract code received reviewer **GO for code readiness** after targeted re-review.
- 2026-05-20 focused DB-backed validation update: Ahmad provided passing evidence for `apps/api/__test__/integration/journals/draft-flow.test.ts` with 6/6 tests passing. API blocker validation is now **GO**.
- Backoffice UI implementation proceeded under the recorded Story 69-3-c unfreeze.
- 2026-05-20 backoffice UI implementation update: journal list/create/edit/post UI is implemented and targeted re-review returned **GO** with no P0/P1/P2/P3 findings. Story awaits owner sign-off before DONE.
- 2026-05-20 owner sign-off update: Ahmad wrote `sign-off`; story is DONE with completion report `story-69-3-c.completion.md`.

## Implementation Sign-Offs

- Backoffice unfreeze: Ahmad selected Story 69-3-c and wrote `unfreeze` on 2026-05-20 for journal create/post screens and tests.
- Reviewer GO: targeted UI re-review task `ses_1bae1adc2ffekMaxlxAwDmt6GP` returned GO with no P0/P1/P2/P3 findings.
- Owner sign-off: Ahmad wrote `sign-off` on 2026-05-20.

## Story

As an **accountant**,  
I want **journal entry draft creation and posting screens**,  
So that **I can enter balanced journal entries and post them with review evidence while preserving GL correctness**.

## Scope

Implement journal list, draft create/edit form, balanced line entry UX, post ReviewPanel, and posted read-only state. This story excludes void/reversal evidence, which is handled by Story 69-3-d.

## Dependencies

- 69-3-a Accounting Contract + Fixture Readiness — MUST be complete or explicitly signed off for this slice.
- 69-3-b Chart of Accounts Screens — MUST be complete if account selector components are reused.
- Story 69-1 ReviewPanel staged forms — MUST be complete.
- Explicit backoffice unfreeze authorization — MUST be recorded in this story before implementation.

## Backoffice Unfreeze Gate

- [x] Explicit unfreeze authorization recorded by story owner for Story 69-3-c — Ahmad wrote `unfreeze` on 2026-05-20.
- [x] Authorization scope includes journal create/post screens and tests.
- [x] If authorization is absent, implementation MUST NOT start — authorization is recorded; API contract blockers still prevent implementation as written.

## Acceptance Criteria

**AC1: Journal list and filters**  
Given the journal page, when data loads, then journals show status, date, reference, total debits, total credits, and filter controls based on verified contract fields.

**AC2: Balanced draft entry**  
Given a user creates a journal, when lines are edited, then debit and credit totals update in real time using canonical money rounding and the form blocks submit/post while unbalanced.

**AC3: Server validation remains authoritative**  
Given client totals show balanced, when the journal is submitted or posted, then server response is authoritative and unbalanced/closed-period errors are surfaced deterministically.

**AC4: Post ReviewPanel**  
Given a draft journal is ready to post, when the user posts it, then ReviewPanel shows material before/after evidence and requires confirmation.

**AC5: Posted state is immutable in UI**  
Given a journal is posted, when detail view renders, then editable fields are read-only and post timestamp/status are visible.

## API Contract Verification Requirements

| Endpoint | Method | Expected Verification | Result |
|----------|--------|----------------------|--------|
| `/api/journals` | GET | List envelope, filters, status values, line summary fields | TBD |
| `/api/journals` | POST | Draft create payload, line schema, balanced validation error shape | TBD |
| `/api/journals/:id` | GET/PATCH | Draft detail/edit behavior and posted immutability contract | TBD |
| `/api/journals/:id/post` | POST | Request shape, idempotency/client transaction behavior if present, posted response, 409/422 errors | TBD |

### API Blocker Implementation Update — 2026-05-20

| Contract Item | Current Result |
|---------------|----------------|
| `GET /api/journals` | Code implemented and focused DB-backed validation passed: returns journal entries with `status`, `reference`, `total_debits`, `total_credits`; supports merged draft/posted listing and DateOnly query validation. |
| `POST /api/journals` | Code implemented and focused DB-backed validation passed: creates `DRAFT` journal records using shared `ManualJournalEntryCreateRequestSchema`; `client_ref` duplicate draft create is idempotent; duplicate posted `client_ref` returns conflict. |
| `GET /api/journals/:id` | Code implemented and focused DB-backed validation passed: returns draft or posted entry; invalid IDs return deterministic `400 INVALID_REQUEST`; posted draft reference is preserved by resolving the source draft. |
| `PATCH /api/journals/:id` | Code implemented and focused DB-backed validation passed: updates draft-only records; posted records return `409 JOURNAL_ALREADY_POSTED`; target and current outlet permission checks are enforced. |
| `POST /api/journals/:id/post` | Code implemented and focused DB-backed validation passed: posts draft to immutable `journal_batches` / `journal_lines`; repost is idempotent; closed fiscal year maps to `FISCAL_YEAR_CLOSED`; missing fiscal year maps to `JOURNAL_OUTSIDE_FISCAL_YEAR`. |

### API Blocker Validation Evidence — 2026-05-20

| Evidence | Result |
|----------|--------|
| `logs/story-69-3-c-reviewfix-validation-r1.exit` | `0` — shared build, db build, modules-accounting build, API typecheck, API lint, fixture-flow lint, migration lint, and `git diff --check` passed. |
| `logs/story-69-3-c-journal-draft-api-r9.log` | Blocked — focused real-DB suite failed in `beforeAll` because login returned `500 INTERNAL_SERVER_ERROR`; API server logs show DB connectivity failure to `172.18.0.2:3306`. |
| Review task `ses_1bb11cabfffe7NID743gJmUXMp` | Code readiness GO; DB validation readiness NO-GO until focused real-DB integration suite passes. |
| Ahmad-provided focused suite output, 2026-05-20 | `apps/api/__test__/integration/journals/draft-flow.test.ts` passed: 1 test file, 6 tests, duration 4.07s. This resolves the DB validation readiness blocker for the API blocker batch. |
| `logs/story-69-3-c-ui-reviewfix-validation-r1.exit` | `0` — focused backoffice journal unit test, backoffice typecheck, backoffice lint, backoffice build, API journal draft-flow test, and `git diff --check` passed. |
| `logs/story-69-3-c-ui-reviewfix-validation-r1.log` | Backoffice focused journal unit test passed 8/8; API focused journal draft-flow passed 6/6. |
| Review task `ses_1bae1adc2ffekMaxlxAwDmt6GP` | Targeted UI re-review GO; prior P1 stale posted selection, stale unsaved draft post, and accounting-date display findings verified fixed. |

### Readiness Findings — 2026-05-20

| Contract Item | Result |
|---------------|--------|
| `GET /api/journals` | Exists; returns posted journal batches with lines; lacks explicit `status`, `reference`, `total_debits`, and `total_credits` fields required by AC1. |
| `POST /api/journals` | Exists; creates an immediately posted immutable journal batch, not a draft. |
| `GET /api/journals/:id` | Exists; returns tenant-scoped batch with lines. |
| `PATCH /api/journals/:id` | Missing. |
| `POST /api/journals/:id/post` | Missing. |
| Draft lifecycle | Missing; no verified draft status/storage/post contract. |
| API boundary validation | Incomplete; runtime route currently passes raw body instead of parsing shared `ManualJournalEntryCreateRequestSchema`. |
| Closed fiscal year error mapping | Incomplete; `FiscalYearClosedError` is not mapped explicitly. |
| Outlet ownership validation | Incomplete; create checks `company_id` but not outlet-company ownership. |

### Readiness Delta — 2026-05-20

The API blocker code path now includes draft tables, draft update, draft posting, shared schema validation, deterministic fiscal-year errors, outlet/account tenant validation, idempotent repost behavior, and focused integration coverage. The backoffice UI now includes journal list filters, draft create/edit form, ReviewPanel post confirmation, server error surfacing, and posted read-only detail. Ahmad provided owner sign-off and `story-69-3-c.completion.md` is finalized.

## Fixture and Test Policy

- Journal fixtures MUST come from `@jurnapod/modules-accounting` owner-package fixtures.
- Draft and posted journal setup MUST use canonical service/repository flow, not ad-hoc SQL.
- Integration tests MUST use real DB and API boundaries.
- Unit tests MAY cover line total calculations and view-model validation.
- Money arithmetic MUST use canonical rounding; no FLOAT/DOUBLE assumptions.
- Negative auth tests MUST use `CASHIER` or a low-privilege custom role lacking `accounting.journals` CREATE/UPDATE.

## Required Validation Evidence with PID/Log Tracking

```bash
nohup npm run test:single -w @jurnapod/backoffice -- __test__/integration/accounting/journal-create-post.test.ts > logs/story-69-3-c-journal-integration.log 2>&1 & echo $! > logs/story-69-3-c-journal-integration.pid
nohup npm run test:single -w @jurnapod/backoffice -- __test__/unit/accounting/journal-entry-form.test.ts > logs/story-69-3-c-journal-unit.log 2>&1 & echo $! > logs/story-69-3-c-journal-unit.pid
nohup npm run typecheck -w @jurnapod/backoffice > logs/story-69-3-c-backoffice-typecheck.log 2>&1 & echo $! > logs/story-69-3-c-backoffice-typecheck.pid
nohup npm run build -w @jurnapod/backoffice > logs/story-69-3-c-backoffice-build.log 2>&1 & echo $! > logs/story-69-3-c-backoffice-build.pid
```

## Tasks / Subtasks

- [x] Implement journal list and filters.
- [x] Implement draft journal form with line editor and real-time balance.
- [x] Implement post ReviewPanel confirmation.
- [x] Implement posted read-only detail state.
- [x] Add unit tests for money totals and form gating.
- [x] Add integration tests for create, post, 403, 409, and 422 paths.

## Dev Notes — 2026-05-20

### Files Modified / Created

- `apps/backoffice/src/features/journals-page.tsx` — Story 69-3-c journal list/create/edit/post UI.
- `apps/backoffice/src/hooks/use-journals.ts` — draft lifecycle API helpers for create/update/post.
- `apps/backoffice/__test__/unit/features/journals-page.test.tsx` — focused unit coverage for route metadata, totals, immutable/read-only wording, stale posted selection reset, dirty draft review blocking, and accounting date display.
- `apps/backoffice/src/features/pages.tsx` — `/journals` route mapped to journal entry screen.
- `apps/backoffice/src/app/routes.ts` — `/journals` route permission metadata for `accounting.journals.READ`.
- `apps/backoffice/src/features/transactions-page.tsx` — compatibility updates for `JournalEntryResponse` union and accounting date display.
- API/package files from the 69-3-c blocker batch remain part of this story evidence: `apps/api/src/lib/journal-handlers.ts`, `apps/api/src/lib/journals.ts`, `apps/api/src/routes/journals.ts`, `apps/api/__test__/integration/journals/draft-flow.test.ts`, `packages/shared/src/schemas/journals.ts`, `packages/modules/accounting/src/journals-service.ts`, `packages/db/migrations/0212_journal_drafts.sql`, `packages/db/src/kysely/schema.ts`.

### Review Findings Resolved

- P1 stale posted selection: selecting a posted journal now resets the draft edit form.
- P1 stale unsaved draft post: Review/post is blocked while visible draft edits differ from saved backend draft evidence.
- P1 date display: list and transaction compatibility display accounting date; `posted_at` remains separate detail/post evidence.

### Validation Evidence

- `logs/story-69-3-c-ui-reviewfix-validation-r1.exit`: `0`.
- `logs/story-69-3-c-ui-reviewfix-validation-r1.log`: focused backoffice unit 8/8 passed; API journal draft-flow 6/6 passed; backoffice typecheck/lint/build passed.
- `logs/story-69-3-c-backoffice-unit.log`: full backoffice unit run has two pre-existing audit route metadata failures unrelated to this story (`platform.settings` expected vs actual `platform.audit`). These are tracked as validation notes, not story blockers.

## Story Done Authority

The implementing developer MUST NOT mark this story done. Done requires reviewer GO, story owner explicit sign-off, and `story-69-3-c.completion.md` with evidence.
