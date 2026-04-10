# Story 38.4: Accounting Transaction Atomicity Fixes

**Status:** done

## Story

As an **engineer**,
I want fiscal-year close and fixed-asset void reversal to be transactionally atomic and correct,
So that concurrent close requests are safely deduplicated and void reversals always target the correct journal lines.

## Context

Two issues found during adversarial review:

### Issue A — `closeFiscalYear` idempotency outside retry transaction
`closeFiscalYear` inserted the idempotency record (`fiscal_year_close_requests`) **before** entering the retried transaction. On a concurrent duplicate request, both could pass the INSERT and proceed to close the same fiscal year simultaneously.

### Issue B — `postVoidToJournal` uses wrong ID for reversal lookup
`postVoidToJournal` queried `journal_lines WHERE journal_batch_id = originalEventId`. But `originalEventId` was the fixed asset event ID, not the journal batch ID. This meant reversal lines were looked up by the wrong key, risking missing or wrong reversals.

## Acceptance Criteria

**AC1: closeFiscalYear idempotency claim is inside the retried transaction**
**Given** two concurrent `closeFiscalYear` calls with the same `closeRequestId`
**When** both enter `withTransactionRetry`
**Then** only one succeeds the INSERT...ON DUPLICATE KEY and proceeds; the other returns the existing result — both within the same retried transaction

**AC2: postVoidToJournal uses journal_batch_id for reversal lookup**
**Given** a fixed asset event with an associated `journal_batch_id`
**When** `postVoidToJournal` is called
**Then** original lines are fetched with `WHERE journal_batch_id = event.journal_batch_id` (not `eventId`)

**AC3: postVoidToJournal enforces tenant scope on source lines**
**Given** a void reversal for company A
**When** original journal lines are fetched
**Then** the query includes `WHERE company_id = companyId` to prevent cross-tenant reversal

**AC4: postVoidToJournal throws on empty source lines**
**Given** a void reversal where no journal lines exist for the original `journal_batch_id`
**When** `postVoidToJournal` executes
**Then** it throws `LifecycleInvalidReferenceError` with a descriptive message

**AC5: postVoidToJournal uses batch insert for reversal lines**
**Given** reversal lines computed from original journal lines
**When** the reversal batch is written
**Then** a single multi-row INSERT is used (not per-line INSERT in a loop) to ensure all-or-nothing atomicity

**AC6: postVoidToJournal asserts reversal balance**
**Given** computed reversal lines
**When** before inserting
**Then** `assertJournalBalanced` is called to fail loudly if the reversal is mathematically unbalanced

## Tasks

### fiscal-year/service.ts
- [x] Extract `claimCloseRequestIdempotency()` private method that runs INSERT...ON DUPLICATE KEY inside a transaction
- [x] Refactor `closeFiscalYear` non-trx path to use `withTransactionRetry` with idempotency claim + close execution in a single retried transaction
- [x] Preserve duplicate-key behavior: return existing request result when found

### fixed-assets/services/lifecycle-service.ts
- [x] Change `postVoidToJournal` parameter from `originalEventId: number` to `originalJournalBatchId: number`
- [x] Update the call site in `voidLifecycleEvent` to pass `event.journal_batch_id`
- [x] Add `where("company_id", "=", companyId)` to the original lines query
- [x] Add guard: throw `LifecycleInvalidReferenceError` if `originalLines.length === 0`
- [x] Build reversal lines array in memory
- [x] Add guard: throw `LifecycleInvalidReferenceError` if `reversalLines.length === 0`
- [x] Call `assertJournalBalanced` on reversal lines before insert
- [x] Replace per-line INSERT loop with batch `sql` template multi-row INSERT
- [x] Run `npm run typecheck -w @jurnapod/modules-accounting`
- [x] Run `npm run build -w @jurnapod/modules-accounting`

## Files Modified

| File | Change |
|------|--------|
| `packages/modules/accounting/src/fiscal-year/service.ts` | Atomic closeFiscalYear with single retried transaction; extract claimCloseRequestIdempotency() |
| `packages/modules/accounting/src/fixed-assets/services/lifecycle-service.ts` | Fix postVoidToJournal: correct ID, tenant scope, batch insert, guards |

## Completion Evidence

- `npm run typecheck -w @jurnapod/modules-accounting` ✅
- `npm run build -w @jurnapod/modules-accounting` ✅
- `npm run test -w @jurnapod/modules-accounting` — all tests pass ✅
