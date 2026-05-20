# Story 69-3-c Readiness Coordination — Journal Entry Create/Post Flow

Date: 2026-05-20

## Decision

**NO-GO for Story 69-3-c implementation as currently written.**

The story requests a draft create/edit/post workflow, but the current API contract supports only immediate journal batch create/read/list. Ahmad has explicitly unfreezed `apps/backoffice` for Story 69-3-c, but implementation still MUST NOT proceed as written until API contract blockers are resolved or the story is explicitly rescoped.

## Decision Update — 2026-05-20

**API blocker code readiness: GO. DB validation readiness: GO. Story UI readiness: READY TO START under recorded unfreeze.**

The API/package blocker implementation now provides draft create/update/post code paths and received targeted review GO for code readiness in task `ses_1bb11cabfffe7NID743gJmUXMp`. Ahmad provided passing focused real-DB integration evidence for `apps/api/__test__/integration/journals/draft-flow.test.ts` on 2026-05-20. Backoffice UI work MAY proceed under the recorded Story 69-3-c unfreeze.

## Contract Facts Discovered

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /api/journals` | Exists | Requires `accounting.journals.READ`; supports `outlet_id`, `start_date`, `end_date`, `doc_type`, `account_id`, `limit`, `offset`; tenant scoped by `auth.companyId`; does not return explicit `status`, `reference`, `total_debits`, or `total_credits`. |
| `POST /api/journals` | Exists | Requires `accounting.journals.CREATE`; creates an already-posted immutable journal batch, not a draft; writes `posted_at` from `entry_date`. |
| `GET /api/journals/:id` | Exists | Requires `accounting.journals.READ`; tenant scoped by batch id plus `auth.companyId`; returns batch with lines. |
| `PATCH /api/journals/:id` | Missing | Required by current story for draft edit behavior but not implemented. |
| `POST /api/journals/:id/post` | Missing | Required by current story for post ReviewPanel behavior but not implemented. |

## Contract Delta Implemented — 2026-05-20

| Endpoint / Area | Code Result | Validation State |
|-----------------|-------------|------------------|
| `GET /api/journals` | Returns draft and posted entries with `status`, `reference`, `total_debits`, `total_credits`; applies DateOnly filters; restricts non-global outlet-scoped listing to permitted outlet IDs. | Static validation passed; focused DB suite passed via Ahmad-provided output. |
| `POST /api/journals` | Creates `DRAFT` records in `journal_drafts` and `journal_draft_lines`; validates request with shared schema; validates outlet/account tenant ownership; handles duplicate `client_ref` deterministically. | Static validation passed; focused DB suite passed via Ahmad-provided output. |
| `GET /api/journals/:id` | Returns draft or posted entry; invalid IDs return `400 INVALID_REQUEST`; posted draft reference is preserved through draft lookup. | Static validation passed; focused DB suite passed via Ahmad-provided output. |
| `PATCH /api/journals/:id` | Updates draft-only records; posted records return `409 JOURNAL_ALREADY_POSTED`; validates current and target outlet authorization. | Static validation passed; focused DB suite passed via Ahmad-provided output. |
| `POST /api/journals/:id/post` | Posts draft into immutable posted journal batch/lines using production insert path; repost returns existing posted batch; closed and outside fiscal year errors use distinct deterministic codes. | Static validation passed; focused DB suite passed via Ahmad-provided output. |
| Migration | Adds draft tables without business triggers; money uses `DECIMAL(19,4)`; migration lint passed. | `logs/story-69-3-c-reviewfix-validation-r1.exit = 0`. |

## Blockers

| Severity | Blocker | Evidence |
|----------|---------|----------|
| P1 | Backoffice unfreeze is recorded, but implementation remains blocked by API contract gaps. | `story-69-3-c.md` Backoffice Unfreeze Gate is checked; missing draft/edit/post contracts remain blockers. |
| P1 | Required draft edit and post endpoints are missing. | `apps/api/src/routes/journals.ts` exposes only list/create/get. |
| P1 | No draft vs posted lifecycle exists. | `JournalBatchResponseSchema` has no `status`; `JournalsService.createManualEntry()` inserts directly to `journal_batches` and `journal_lines`. |
| P1 | Current POST creates posted immutable journal batches, not drafts. | `insertJournalBatch()` writes `posted_at`; `createManualEntry()` passes `postedAt: data.entry_date`. |
| P1 | Story AC1 requires fields not currently returned. | Current response lacks explicit `status`, `reference`, `total_debits`, and `total_credits`. |
| P1 | Closed fiscal year errors are not fully mapped deterministically. | Service can throw `FiscalYearClosedError`; handler maps only `JournalOutsideFiscalYearError` name to `FISCAL_YEAR_CLOSED`. |
| P1 | Create body is not validated with the shared Zod schema at the API route/handler boundary. | `apps/api/src/routes/journals.ts` passes raw body to handler; shared `ManualJournalEntryCreateRequestSchema` exists. |
| P1 | Outlet ownership validation is incomplete on journal create. | Handler checks `company_id` mismatch but does not verify supplied `outlet_id` belongs to `auth.companyId`. |

## Blocker Delta — 2026-05-20

| Severity | Status | Evidence |
|----------|--------|----------|
| P1 | API contract blockers are code-resolved by inspection and targeted re-review. | Review task `ses_1bb11cabfffe7NID743gJmUXMp` returned code readiness GO and no code-scope P0/P1/P2/P3 findings. |
| P1 | DB-backed validation remains blocked by environment. | `logs/story-69-3-c-journal-draft-api-r9.log` shows login `500 INTERNAL_SERVER_ERROR`; API server log shows DB connectivity failure to `172.18.0.2:3306`; all 6 focused tests skipped after suite setup failure. |
| P1 | DB-backed validation blocker resolved by Ahmad-provided focused suite evidence. | `apps/api/__test__/integration/journals/draft-flow.test.ts` passed 6/6 tests on 2026-05-20; duration 4.07s. |

## Static Validation Evidence — 2026-05-20

`logs/story-69-3-c-reviewfix-validation-r1.exit` is `0` for the following command chain:

```bash
npm run build -w @jurnapod/shared
npm run build -w @jurnapod/db
npm run build -w @jurnapod/modules-accounting
npm run typecheck -w @jurnapod/api
npm run lint -w @jurnapod/api
npm run lint:fixture-flow
npm run lint:migrations
```

## Recommended Rescope

### Option A — API-contract-first split

Create a prerequisite API story before backoffice UI:

1. Define journal draft lifecycle contract.
2. Add or explicitly reject draft status storage model.
3. Add `PATCH /api/journals/:id` for draft-only edits if drafts are supported.
4. Add `POST /api/journals/:id/post` with idempotency and deterministic conflict handling if drafts are supported.
5. Add response fields needed by UI: `status`, `reference`, `total_debits`, `total_credits`.
6. Add shared Zod validation at API boundary.
7. Add deterministic closed-period error mapping.
8. Add outlet ownership validation.
9. Add owner-package fixtures for draft and posted journals.

### Option B — Read-only journal list/detail rescope

If draft/post API work is not approved in this slice, rescope Story 69-3-c to read-only list/detail of existing posted journal batches only. Create/edit/post UI MUST be deferred to a new API-backed story.

## Backoffice Freeze Result

Backoffice unfreeze for Story 69-3-c is recorded. Implementation MUST NOT start as written until the API contract blockers are resolved or the story is explicitly rescoped.

## Reviewer

- Architecture readiness review task: `ses_1bc5136b3ffeqk4GmlVw3on6SG`
