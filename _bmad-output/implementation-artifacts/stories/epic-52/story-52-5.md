# Story 52-5: AP Idempotency Key Standardization

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 52-5 |
| Epic | Epic 52: Datetime Standardization + Idempotency Hardening |
| Title | AP Idempotency Key Standardization |
| Status | backlog |
| Risk | P1 |
| Owner | dev |
| QA Gate | yes |
| Dependencies | Story 52-4 (fiscal close pattern as reference) |

## Story

Standardize all AP document types (Purchase Order, Goods Receipt, Purchase Invoice, Payment, Credit Note) on a single `idempotency_key` column pattern with DB-atomic dedup.

## Context

AP document types currently have inconsistent idempotency handling:
- Some use `client_tx_id` (legacy POS pattern)
- Some use application-level check-then-insert
- No consistent `idempotency_key` column across all 5 AP document types

The canonical pattern should be:
- `idempotency_key: string` column on each AP document table
- Unique constraint: `(company_id, idempotency_key)` per document type
- `INSERT...ON DUPLICATE KEY` for atomic dedup
- `client_tx_id` remains reserved for POS sync

## Acceptance Criteria

- [ ] All five AP document types have `idempotency_key: string` column
- [ ] Unique constraint: `(company_id, idempotency_key)` per document type table
- [ ] Insert path checks `idempotency_key` existence before insert; duplicate returns existing record
- [ ] AP payment atomic: `ap_payments` record + GL journal entry in single DB transaction
- [ ] AP credit note void is idempotent: voiding already-voided note returns OK
- [ ] No document type uses `client_tx_id` for idempotency (reserved for POS sync)

## Tasks/Subtasks

- [ ] 5.1 Audit all 5 AP document tables for existing idempotency column patterns (PO, GRN, PI, Payment, Credit Note)
- [ ] 5.2 Add `idempotency_key` column to any AP table missing it (additive migration, guarded)
- [ ] 5.3 Add unique constraint on `(company_id, idempotency_key)` for each AP table (if not already present)
- [ ] 5.4 Audit AP payment route — verify uses `idempotency_key` not `client_tx_id`
- [ ] 5.5 Refactor AP payment to use `INSERT...ON DUPLICATE KEY` for atomic idempotency
- [ ] 5.6 Verify AP credit note void is idempotent (already-voided note voided again returns OK)
- [ ] 5.7 Add integration test: duplicate PO submission → second returns DUPLICATE
- [ ] 5.8 Add integration test: duplicate GRN submission → single receipt created
- [ ] 5.9 Add integration test: duplicate PI submission → single invoice created
- [ ] 5.10 Add integration test: duplicate payment submission → single payment + journal
- [ ] 5.11 Run `npm run test:integration -w @jurnapod/modules-purchasing -- --grep "idempotency.*payment|idempotency.*po|idempotency.*credit" --run`

## Dev Notes

- `idempotency_key` format: client-supplied string (UUID or similar) — must be stable per business operation
- AP payment atomicity: `ap_payments` + `journal_entries` in same transaction — if journal fails, payment rolls back
- Credit note void idempotency: voiding an already-voided note should return OK (not error), no duplicate journal reversal
- `client_tx_id` is reserved for POS sync — AP documents use `idempotency_key` to avoid confusion

## Validation Commands

```bash
rg "idempotency_key" packages/modules/purchasing/src/ --type ts -l
npm run test:integration -w @jurnapod/modules-purchasing -- --grep "idempotency.*payment|idempotency.*po|idempotency.*credit" --run
```

## File List

```
packages/modules/purchasing/src/
apps/api/src/routes/purchasing/
packages/db/src/migrations/
```

## Change Log

- (none yet)

## Dev Agent Record

- (none yet)