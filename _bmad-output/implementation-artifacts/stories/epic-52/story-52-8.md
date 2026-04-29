# Story 52-8: AP Payment + Journal Atomicity Verification

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 52-8 |
| Epic | Epic 52: Datetime Standardization + Idempotency Hardening |
| Title | AP Payment + Journal Atomicity Verification |
| Status | backlog |
| Risk | P0 |
| Owner | dev |
| QA Gate | yes |
| Dependencies | Story 52-5 (idempotency key standardized) |

## Story

Prove AP payment creation and GL journal entry are atomic; no orphaned payment record if journal insert fails.

## Context

AP payment creation must be transactionally atomic with its GL journal entry:
- `POST /ap/payments` creates `ap_payments` record AND `journal_entries` in single DB transaction
- If journal insert fails, `ap_payments` record must be rolled back (no orphaned payment)
- If payment insert fails, no journal entry created
- Idempotency: re-submitting same `idempotency_key` returns existing payment + journal

This is a P0 correctness requirement — a payment without a journal would create financial imbalance.

## Acceptance Criteria

- [ ] `POST /ap/payments` creates `ap_payments` record AND `journal_entries` in single DB transaction
- [ ] If journal insert fails, `ap_payments` record rolled back; no orphaned payment in `posted` state
- [ ] If payment insert fails, no journal entry created
- [ ] Idempotency: re-submitting same `idempotency_key` returns existing payment + journal (no duplicate)
- [ ] Release (approve + post) is single atomic action, not two separate API calls

## Tasks/Subtasks

- [ ] 8.1 Audit AP payment route/service — verify payment + journal in single transaction
- [ ] 8.2 Add transaction test: simulate journal insert failure → verify payment rolled back
- [ ] 8.3 Add transaction test: simulate payment insert failure → verify no journal created
- [ ] 8.4 Add idempotency test: re-submit same `idempotency_key` → returns existing payment + journal
- [ ] 8.5 Verify release action is single atomic call (not approve-then-post two-step)
- [ ] 8.6 Run `npm run test:integration -w @jurnapod/modules-purchasing -- --grep "payment.*atomic|payment.*journal.*tx" --run`

## Dev Notes

- Transactional atomicity test: can use transaction rollback simulation (e.g., force journal insert to throw after payment insert succeeds) to verify no orphaned payment
- `INSERT...ON DUPLICATE KEY` returns existing row on duplicate — the existing row includes the journal_id, so we can return the full existing record
- Release (approve + post) as single atomic action: `approvePayment(id)` should do both approve and post in one transaction, not expose two separate endpoints that must be called in order

## Validation Commands

```bash
npm run test:integration -w @jurnapod/modules-purchasing -- --grep "payment.*atomic|payment.*journal.*tx" --run
```

## File List

```
packages/modules/purchasing/src/services/payment-service.ts
apps/api/src/routes/purchasing/
packages/modules/accounting/src/services/journal-service.ts
```

## Change Log

- (none yet)

## Dev Agent Record

- (none yet)