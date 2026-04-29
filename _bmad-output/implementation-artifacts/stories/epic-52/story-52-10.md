# Story 52-10: Integration Test Gate: End-to-End Idempotency Proof Suite

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 52-10 |
| Epic | Epic 52: Datetime Standardization + Idempotency Hardening |
| Title | Integration Test Gate: End-to-End Idempotency Proof Suite |
| Status | backlog |
| Risk | P0 |
| Owner | architect/dev/qa |
| QA Gate | yes (mandatory) |
| Dependencies | Stories 52-1 through 52-9 all complete |

## Story

Establish deterministic integration test suite proving all idempotency paths are correct; suite must pass 3× consecutive green before epic close.

## Context

This is the epic completion gate. All prior stories contribute idempotency correctness. This story creates a deterministic, no-flaky test suite that proves:
- Same idempotency key submitted twice → one financial effect only
- No duplicate GL entries under any condition
- Concurrent submissions handled correctly
- Test suite passes 3× consecutively in CI

## Acceptance Criteria

- [ ] Suite covers: fiscal close duplicate, AP payment duplicate, POS transaction duplicate, credit note void idempotency, sync push duplicate
- [ ] Each test: submit same idempotency key twice → first returns OK, second returns DUPLICATE (or cached result)
- [ ] Each test verifies: no duplicate financial effect (journal count, stock movement count unchanged on duplicate)
- [ ] Tests use real DB (no mocks); deterministic fixtures via canonical helpers
- [ ] Suite runs in <5 minutes; noflaky by design
- [ ] 3× consecutive green on CI before story close

## Tasks/Subtasks

- [ ] 10.1 Design and document idempotency test matrix (which stories cover which scenarios)
- [ ] 10.2 Create deterministic fixtures for: company, outlet, fiscal year, AP supplier, PO/GRN/PI chain
- [ ] 10.3 Add integration test: fiscal close idempotency (same close_request_id → first OK, second DUPLICATE)
- [ ] 10.4 Add integration test: AP payment idempotency (same idempotency_key → one payment, one journal)
- [ ] 10.5 Add integration test: POS transaction idempotency (same client_tx_id → one journal)
- [ ] 10.6 Add integration test: credit note void idempotency (void already-voided note → OK)
- [ ] 10.7 Add integration test: sync push duplicate (same client_tx_id → DUPLICATE, no journal)
- [ ] 10.8 Run suite once, fix any failures
- [ ] 10.9 Run suite 3× consecutive, verify 3× green
- [ ] 10.10 Verify suite runs in <5 minutes

## Dev Notes

- This story depends on all prior stories — it cannot start until all 52-1 through 52-9 are complete
- The test suite is the acceptance criterion for the entire epic — if it doesn't pass 3× green, the epic is not done
- Each test must verify financial effect (journal count, stock movement count) not just API response
- Flaky tests are a failure of this story — deterministic fixtures and no timing dependencies are required
- Canonical helpers from `apps/api/src/lib/test-fixtures.ts` should be used for all fixture setup

## Validation Commands

```bash
npm run test:integration -w @jurnapod/api -- --grep "idempotency" --run
# Run 3× and confirm 3× green
```

## File List

```
apps/api/__test__/integration/idempotency/
packages/modules/accounting/__test__/integration/
packages/modules/purchasing/__test__/integration/
packages/pos-sync/__test__/integration/
```

## Change Log

- (none yet)

## Dev Agent Record

- (none yet)