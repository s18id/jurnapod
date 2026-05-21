# Story 69-3-d Completion Report

**Story:** Journal Void/Reversal Evidence Flow
**Epic:** 69 - Accounting Domain Screens
**Status:** ✅ DONE
**Completed:** 2026-05-20

---

## Summary

Story 69-3-d delivers the generic journal void/reversal contract and backoffice evidence flow. The implementation adds additive reversal persistence, shared void/reversal response contracts, a generic `POST /api/journals/:id/void` endpoint, real-DB API coverage for duplicate/race/idempotency behavior, and a backoffice ReviewPanel flow that requires `accounting.journals.DELETE`, captures an auditable reason, displays before/after evidence, and renders backend-provided original/reversal IDs without fabricating audit links.

Story Done Authority is complete: reviewer GO is recorded and Ahmad/story owner wrote `sign off` on 2026-05-20.

---

## Files Created/Modified

### Created

| File | Description |
|------|-------------|
| `packages/db/migrations/0213_journal_reversals.sql` | Adds additive `journal_reversals` cross-link persistence with unique original/reversal links and no business trigger. |
| `apps/api/__test__/integration/journals/void-reversal.test.ts` | Real-DB API coverage for void success, reversal linkage, duplicate guard, concurrent duplicate void, missing reason, DELETE permission, missing/cross-tenant not-found, draft rejection, and invalid IDs. |
| `apps/api/__test__/unit/accounting/journals-stale-service.test.ts` | Unit regression test for fail-closed stale service behavior with no mutation call. |
| `_bmad-output/implementation-artifacts/stories/epic-69/story-69-3-d.readiness-coordination.md` | Readiness, API-contract-first, and UI resolution coordination record. |

### Modified

| File | Changes |
|------|---------|
| `packages/db/src/kysely/schema.ts` | Adds Kysely typings for `journal_reversals`. |
| `packages/shared/src/schemas/journals.ts` | Adds `VOIDED` and `REVERSAL` statuses, void/reversal metadata fields, and `JournalVoidRequestSchema`. |
| `packages/modules/accounting/src/journals-service.ts` | Adds posted-batch-first void target resolution, raw DECIMAL reversal line creation, duplicate/race guards, reversal link lookup, and status derivation for list/get. |
| `apps/api/src/lib/journals.ts` | Adds thin adapter for void and fail-closed stale-service guard. |
| `apps/api/src/lib/journal-handlers.ts` | Adds DELETE permission handling, void request parsing, deterministic error mapping, and stale-service mismatch response. |
| `apps/api/src/routes/journals.ts` | Adds runtime and OpenAPI route for `POST /journals/:id/void` plus void/reversal response fields. |
| `apps/backoffice/src/hooks/use-journals.ts` | Adds `voidManualJournalEntry()` using relative `/journals/:id/void`. |
| `apps/backoffice/src/features/journals-page.tsx` | Adds status filters for `VOIDED`/`REVERSAL`, DELETE-gated void action, ReviewPanel void evidence flow, correction metadata display, deterministic error mapping, and incomplete reversal evidence guard. |
| `apps/backoffice/__test__/unit/features/journals-page.test.tsx` | Adds focused UI coverage for void/reversal statuses, DELETE gate, deterministic errors, void diff evidence, and missing reversal evidence handling. |
| `_bmad-output/implementation-artifacts/stories/epic-69/story-69-3-d.md` | Records API/UI verification evidence, reviewer GO, completed subtasks, and pending owner sign-off. |
| `_bmad-output/implementation-artifacts/stories/epic-69/story-69-3.md` | Updates split-control status for 69-3-d. |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Updates 69-3-d to `in-progress` via canonical script. |

---

## Acceptance Criteria Status

| AC | Requirement | Status |
|----|-------------|--------|
| AC1 | Void action requires permission and reason. | ✅ Complete — UI requires `accounting.journals.DELETE`, gates action to `POSTED` + `MANUAL`, requires non-empty trimmed reason, and backend integration verifies low-privilege denial. |
| AC2 | ReviewPanel evidence is complete. | ✅ Complete — Void ReviewPanel shows status before/after, affected journal ID, reason, totals, lines, expected backend reversal behavior, diff evidence, and final confirmation. |
| AC3 | Reversal cross-link displayed. | ✅ Complete — Original VOIDED journals display `reversal_journal_id`; REVERSAL journals display `original_journal_id` as backend-provided text IDs only. |
| AC4 | Posted records remain immutable. | ✅ Complete — Finalized journal detail is read-only; original posted rows are not mutated for void state; reversal link table provides audit trace. |
| AC5 | Conflict and not-found errors are deterministic. | ✅ Complete — API and UI map missing journal, already-voided, draft-void, void-not-allowed, forbidden, invalid reason, and service-version mismatch cases. |

---

## Key Features Implemented

### API Contract and Persistence

- `journal_reversals` records original and reversal batch IDs with void reason, void timestamp, and actor.
- `POST /api/journals/:id/void` creates a balanced `MANUAL_REVERSAL` journal and links it to the original.
- Duplicate void attempts return deterministic conflict and do not create duplicate financial effects.
- Concurrent duplicate void attempts are serialized by locks/unique constraints and verified with real-DB tests.
- Draft and reversal journals cannot be voided.

### Backoffice Evidence Flow

- Journal list supports `DRAFT`, `POSTED`, `VOIDED`, and `REVERSAL` filters.
- Void action appears only for eligible `POSTED` + `MANUAL` journals with DELETE permission.
- ReviewPanel captures reason and displays before/after evidence before calling the backend.
- Successful void uses backend response as the source of truth and refetches the list.
- A `VOIDED` response without `reversal_journal_id` is treated as incomplete evidence and surfaced as an error, not green success.

---

## Technical Implementation

### Data Flow

```text
User selects eligible posted manual journal
→ UI verifies DELETE gate and opens void ReviewPanel
→ user enters non-empty reason and completes ReviewPanel confirmation
→ POST /journals/:id/void sends { reason }
→ backend resolves posted batch first, creates balanced reversal, links original/reversal
→ UI renders backend VOIDED response and correction metadata
→ list refetches from backend
```

### API Endpoints Used

- `GET /journals` — list draft/posted/voided/reversal journal entries.
- `GET /journals/:id` — retrieve journal detail with correction metadata.
- `POST /journals/:id/void` — void eligible posted manual journal with reversal.

### Security

- UI requires `accounting.journals.DELETE` to initiate void.
- Backend enforces `accounting.journals.DELETE` and outlet-aware access.
- Cross-tenant journal IDs return deterministic not-found behavior.
- API calls use canonical backoffice `apiRequest()` with relative paths and no explicit access-token override.

---

## Code Quality

| Check | Result |
|-------|--------|
| Shared build | ✅ Passed in `logs/story-69-3-d-api-validation-r1.log`. |
| DB build | ✅ Passed in `logs/story-69-3-d-api-validation-r1.log`. |
| Modules accounting build | ✅ Passed in `logs/story-69-3-d-api-validation-r1.log` and `logs/story-69-3-d-version-guard-validation-r1.log`. |
| API typecheck/lint | ✅ Passed in `logs/story-69-3-d-api-validation-r1.log`. API lint had existing warnings only. |
| Backoffice typecheck/lint | ✅ Passed in `logs/story-69-3-d-ui-validation-r1.log` and `logs/story-69-3-d-ui-p2fix-validation-r1.log`. |
| Backoffice build | ✅ Passed in `logs/story-69-3-d-ui-validation-r1.log` with existing Vite chunk warnings. |
| Fixture-flow lint | ✅ Passed in `logs/story-69-3-d-api-validation-r1.log`. |
| Migration lint | ✅ Passed in `logs/story-69-3-d-api-validation-r1.log`. |
| Whitespace | ✅ `git diff --check` passed in validation logs. |

---

## Known Limitations

### Functional

1. **Client-side status/reference filtering is scoped to the loaded page:** The current journal list fetches the first 100 rows and applies status/reference filtering client-side. Reviewer classified this as P3, not a blocker. A future report/list enhancement MUST add backend-supported status/reference filters or visible result-scope messaging.

### Process

1. **No known functional limitations in story scope:** Reviewer GO is recorded and owner sign-off is complete.

---

## Testing Performed

- ✅ API void/reversal integration: 7/7 passing in `logs/story-69-3-d-ui-validation-r1.log`.
- ✅ Backoffice journal focused unit: 10/10 passing in `logs/story-69-3-d-ui-p2fix-validation-r1.log`.
- ✅ Stale service fail-closed unit: 1/1 passing in `logs/story-69-3-d-stale-service-test-r1.log`.
- ✅ Backoffice typecheck, lint, build.
- ✅ API/package static validation, fixture-flow lint, and migration lint.
- ✅ Sprint status validation passed after final in-progress update in `logs/story-69-3-d-final-docs-validation-r1.log`.

---

## Dead Code Audit

Not an extraction/deletion story. No adapter shim or package extraction cleanup was required. Modified areas were checked for story-scope stale TODO/FIXME and no story-created dead code path remains.

---

## API Gaps Encountered

| Gap | Discovered | Resolution |
|-----|------------|------------|
| Missing generic journal void endpoint | 69-3-d readiness review | Added `POST /api/journals/:id/void`. |
| Missing shared void/reversal contract | 69-3-d readiness review | Added statuses and metadata fields to shared journal schemas. |
| Missing persistence cross-link | 69-3-d readiness review | Added additive `journal_reversals` table. |
| Missing duplicate/race evidence | QA review | Added sequential and concurrent duplicate void integration coverage. |
| Missing stale-service fail-closed coverage | QA review | Added guard and unit regression test. |
| Missing incomplete reversal evidence handling | UI QA review | Added `VOID_EVIDENCE_INCOMPLETE` error path and unit coverage. |

---

## Dev Notes

### Pattern Consistency

- Backoffice API calls follow relative `apiRequest()` paths.
- ReviewPanel follows Story 69-1 and 69-3-c evidence patterns with final confirmation.
- API routes remain thin and delegate persistence/business behavior to the accounting package.

### Type Safety

- Backoffice uses `JournalEntryResponse` for status discrimination across `DRAFT`, `POSTED`, `VOIDED`, and `REVERSAL`.
- Shared Zod contracts define void request and response metadata.

### Fixture Flow Mode

- Full Fixture Mode/API flow was used for integration setup through create/post journal paths.
- No raw SQL setup was introduced in tests; DB queries in void-reversal integration are read-only verification.

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-20 | 1.0 | Implemented API contract, additive persistence, and focused API tests. |
| 2026-05-20 | 1.1 | Resolved API reviewer findings for posted-batch-first target resolution, raw DECIMAL reversal, concurrent duplicate coverage, and stale-service fail-closed guard. |
| 2026-05-20 | 1.2 | Implemented backoffice void/reversal ReviewPanel evidence flow and focused UI tests. |
| 2026-05-20 | 1.3 | Resolved UI reviewer P2 by surfacing incomplete reversal evidence as an error. |

---

## Sign-Offs

- API reviewer GO: `ses_1ba9b57d9ffeUq43DT6VlAv8wQ` returned GO with no P0/P1 blockers after targeted fixes.
- UI reviewer GO: `ses_1ba74f11affeGWZEu5fXy3NMhz` returned GO; targeted P2 re-review returned GO with no findings.
- Owner sign-off: Ahmad wrote `sign off` on 2026-05-20.

---

**Story is COMPLETE.**
