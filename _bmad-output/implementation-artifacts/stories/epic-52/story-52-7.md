# Story 52-7: Sync Idempotency: Duplicate vs Error Differentiation

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 52-7 |
| Epic | Epic 52: Datetime Standardization + Idempotency Hardening |
| Title | Sync Idempotency: Duplicate vs Error Differentiation |
| Status | backlog |
| Risk | P0 |
| Owner | dev |
| QA Gate | yes |
| Dependencies | Story 52-6 (sync contract standardized) |

## Story

Prove duplicate detection never processes a transaction twice within a single push batch; error classification is deterministic.

## Context

When a sync push batch contains mixed outcomes (some OK, some DUPLICATE, some ERROR), the implementation must:
- Skip processing for DUPLICATE — no journal, no stock update, return DUPLICATE immediately
- Process ERROR with machine-readable code — no partial state
- Continue processing remaining transactions in the batch after a DUPLICATE or ERROR

Skipped (DUPLICATE) transactions must be logged with `result=SKIPPED` in the idempotency audit log.

## Acceptance Criteria

- [ ] Duplicate: `client_tx_id` + `company_id` already exists in DB → return `DUPLICATE` (no processing, no journal, no stock update)
- [ ] Error: validation failure, company_id mismatch, outlet_id mismatch → return `ERROR` with machine-readable code
- [ ] Within same batch: duplicate is skipped; remaining transactions proceed
- [ ] Skipped (duplicate) transactions logged with `result=SKIPPED` in idempotency audit log
- [ ] Skipped transactions never create GL journal entries or stock movements
- [ ] 3× retry with exponential backoff on transient failure; after exhaustion → `FAILED` status in outbox

## Tasks/Subtasks

- [ ] 7.1 Audit sync push handler for duplicate detection logic — verify no processing occurs on duplicate
- [ ] 7.2 Verify duplicate skip path: no journal created, no stock movement, audit log entry written
- [ ] 7.3 Audit error classification: validation failure → ERROR with machine-readable code
- [ ] 7.4 Verify batch continues processing after DUPLICATE (remaining transactions not blocked)
- [ ] 7.5 Verify retry logic: up to 3 retries with exponential backoff on transient failure
- [ ] 7.6 Add integration test: submit same `client_tx_id` twice → first OK, second DUPLICATE, one journal
- [ ] 7.7 Add integration test: error path — invalid company_id returns ERROR with code
- [ ] 7.8 Add integration test: 3 retries then FAIL status in outbox (deadlock scenario)
- [ ] 7.9 Run `npm run test:integration -w @jurnapod/pos-sync -- --grep "duplicate.*skip|duplicate.*journal|idempotency.*audit" --run`

## Dev Notes

- `result=SKIPPED` in audit log: this is different from `DUPLICATE` (which is the API response) — SKIPPED is an internal logging state showing the duplicate was detected and skipped without processing
- Machine-readable error codes should be consistent across all sync error paths — define standard error code vocabulary
- Exponential backoff: typical pattern is `delay = min(baseDelay * 2^attempt, maxDelay)` with jitter
- Max 3 retries then `FAILED` status in outbox — outbox processor stops retrying and marks as FAILED

## Validation Commands

```bash
npm run test:integration -w @jurnapod/pos-sync -- --grep "duplicate.*skip|duplicate.*journal|idempotency.*audit" --run
# Verify: no journal created for DUPLICATE; audit log entry written
rg "SKIPPED" packages/pos-sync/src/ --type ts
```

## File List

```
packages/pos-sync/src/push/
packages/pos-sync/src/push/handlers/
apps/api/src/routes/sync/
packages/db/src/migrations/
```

## Change Log

- (none yet)

## Dev Agent Record

- (none yet)