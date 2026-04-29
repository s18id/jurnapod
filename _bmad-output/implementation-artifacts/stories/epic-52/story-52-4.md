# Story 52-4: Fiscal Close Idempotency DB-Atomic Hardening

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 52-4 |
| Epic | Epic 52: Datetime Standardization + Idempotency Hardening |
| Title | Fiscal Close Idempotency DB-Atomic Hardening |
| Status | backlog |
| Risk | P0 |
| Owner | architect/dev |
| QA Gate | yes |
| Dependencies | None |

## Story

Verify fiscal year close uses atomic `INSERT...ON DUPLICATE KEY` for idempotency key claim; all state transitions inside retried transaction; no race window between claim and execution.

## Context

Current implementation in `apps/api/src/lib/fiscal-years.ts` uses application-level idempotency check (SELECT then INSERT) for `close_request_id`. This has a TOCTOU race: two simultaneous requests with same `close_request_id` both pass the existence check and create duplicates.

The correct pattern is `INSERT...ON DUPLICATE KEY UPDATE` which atomically claims the idempotency key and returns existing row in one round-trip.

## Acceptance Criteria

- [ ] `closeFiscalYear` claims idempotency key via `INSERT...ON DUPLICATE KEY` (not pre-transactional SELECT + INSERT)
- [ ] Idempotency key claim, state transition, and journal writes happen in **single retried transaction**
- [ ] Duplicate close request returns existing result immediately (no re-execution)
- [ ] Concurrent close attempts with same key: one wins, others return cached result
- [ ] `fiscal_year_closes` table enforces unique constraint on `(company_id, fiscal_year_id, close_request_id)`
- [ ] State machine: `PENDING` → `IN_PROGRESS` → `SUCCEEDED` | `FAILED`
- [ ] Retry logic: up to 3 retries with exponential backoff on deadlock/lock wait timeout

## Tasks/Subtasks

- [ ] 4.1 Audit `apps/api/src/lib/fiscal-years.ts` — find current idempotency check pattern for `close_request_id`
- [ ] 4.2 Verify `fiscal_year_closes` table has unique constraint on `(company_id, fiscal_year_id, close_request_id)`
- [ ] 4.3 Refactor `closeFiscalYear` to use `INSERT...ON DUPLICATE KEY UPDATE` for atomic key claim
- [ ] 4.4 Verify `withTransactionRetry` wraps entire close flow (claim + state transition + journals)
- [ ] 4.5 Add integration test: submit same `close_request_id` twice concurrently → first succeeds, second returns DUPLICATE
- [ ] 4.6 Add integration test: verify no duplicate journal entries on retry with same key
- [ ] 4.7 Verify state machine transitions: PENDING → IN_PROGRESS → SUCCEEDED/FAILED
- [ ] 4.8 Run `npm run test:integration -w @jurnapod/modules-accounting -- --grep "closeFiscalYear|idempotency.*close" --run`

## Dev Notes

- The `INSERT...ON DUPLICATE KEY UPDATE` pattern for fiscal close: first insert tries to claim the key; if duplicate key hit, MySQL updates zero rows and we can SELECT the existing row to return cached result
- The key claim, state transition, and journal writes must be in one transaction — if key claim succeeds but state transition fails, the whole transaction rolls back and the key is released for retry
- `withTransactionRetry` handles deadlock/lock-wait-timeout retriages with exponential backoff
- The unique constraint must include `company_id` to prevent cross-tenant collision

## Validation Commands

```bash
npm run test:integration -w @jurnapod/modules-accounting -- --grep "closeFiscalYear|idempotency.*close" --run
# Verify 3 consecutive green runs
rg "INSERT.*ON DUPLICATE KEY" packages/modules/accounting/src/fiscal-year/service.ts
rg "withTransactionRetry" packages/modules/accounting/src/fiscal-year/service.ts
```

## File List

```
apps/api/src/lib/fiscal-years.ts
packages/modules/accounting/src/fiscal-year/service.ts
packages/db/src/migrations/
```

## Change Log

- (none yet)

## Dev Agent Record

- (none yet)