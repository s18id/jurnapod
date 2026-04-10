# Epic 38: Transaction Safety & Deadlock Hardening

**Status:** done
**Theme:** Reliability / Production Hardening
**Started:** 2026-04-10
**Completed:** 2026-04-10

## Epic Goal

Harden the monorepo against MySQL deadlocks and lock-wait-timeout errors by extending `withTransactionRetry` to handle both, fixing transaction-boundary bugs in company service audit logging, fixing import batch operation counts, and addressing fiscal-year close and fixed-asset void reversal correctness.

## Context

During import and company-update load, two classes of MySQL lock errors were causing test failures and production risk:

1. **ER_LOCK_WAIT_TIMEOUT (errno 1205)** — `withTransactionRetry` only caught `ER_LOCK_DEADLOCK` (1213). Lock-wait-timeout errors propagated as unhandled exceptions, causing API timeouts.

2. **Cross-connection audit logging** — `CompanyService.updateCompany` created `AuditService` with `this.db` (main connection pool) outside the transaction callback, but used it inside the retried transaction. The audit write ran on a separate connection while the company transaction held row locks — causing cascading lock waits and 60s timeouts.

Additionally, import batch operations had two correctness bugs:
- Counts (`created`/`updated`) were incremented **before** durable DB writes, so failures left inflated counts
- `batchUpdateItems`/`batchUpdatePrices` used the outer `db` instance inside `withTransactionRetry` callbacks instead of the `trx` parameter — defeating the retry atomicity guarantee

And two accounting correctness issues were found during review:
- `closeFiscalYear` split the idempotency insert **outside** the retried transaction, allowing duplicate close requests to be accepted in concurrent scenarios
- `postVoidToJournal` in fixed-assets used `eventId` instead of `journal_batch_id` to look up reversal lines, risking reversal of wrong/missing lines

## Stories

- [Story 38.1](story-38.1.md): Lock Wait Timeout + Transaction Boundary Fixes
- [Story 38.2](story-38.2.md): Import Batch Correctness Fixes
- [Story 38.3](story-38.3.md): Company Service Audit Transaction Boundary Fix
- [Story 38.4](story-38.4.md): Accounting Transaction Atomicity Fixes

## Definition of Done

- [x] `isDeadlockError()` detects `ER_LOCK_WAIT_TIMEOUT` (1205), `ER_LOCK_DEADLOCK` (1213), and message patterns for both
- [x] `withTransactionRetry` retries on both deadlock and lock-wait-timeout transparently
- [x] Import batch `created`/`updated` counts reflect actual DB results after durable commit
- [x] `batchUpdateItems`/`batchInsertItems`/`batchUpdatePrices` use `trx` inside retry callbacks
- [x] `setTestItemLowStockThreshold` uses `withTransactionRetry` for both set and cleanup reset
- [x] `CompanyService.updateCompany`/`deactivateCompany`/`reactivateCompany` create `AuditService` with `trx` (same connection as business logic)
- [x] `closeFiscalYear` idempotency claim (INSERT...ON DUPLICATE KEY) runs inside the retried transaction
- [x] `postVoidToJournal` uses `journal_batch_id` (not eventId) for reversal lookup, with tenant scoping and balanced assertion
- [x] All integration tests pass: 132 test files, 929 tests
- [x] Lint: 0 errors in `@jurnapod/api`, `@jurnapod/modules-platform`, `@jurnapod/db`

## Dependencies

- None — self-contained hardening, no new packages or schema

## Risks

| Risk | Mitigation |
|------|------------|
| Broad retry could mask real data errors | Retry only on known lock errors (1205, 1213); all other errors propagate |
| Lock-wait-timeout retry under extreme load | `maxAttempts=5` with exponential backoff; production load testing recommended |
