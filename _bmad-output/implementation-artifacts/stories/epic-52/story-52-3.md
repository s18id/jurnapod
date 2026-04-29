# Story 52-3: POS Server-Side Timestamp Alignment

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 52-3 |
| Epic | Epic 52: Datetime Standardization + Idempotency Hardening |
| Title | POS Server-Side Timestamp Alignment |
| Status | backlog |
| Risk | P1 |
| Owner | dev |
| QA Gate | yes |
| Dependencies | Story 52-1 (datetime surface available in `@jurnapod/shared`) |

## Story

Ensure POS sync handlers and `pos_transactions` table use BIGINT unix ms timestamps consistently server-side; client timestamps validated at ingestion.

## Context

`packages/db/src/kysely/schema.ts` line 1210 defines `PosTransactions.trx_at: Date` — MySQL DATETIME storage. This is inconsistent with the canonical `BIGINT` unix ms storage used in all other business timestamp fields. Additionally:
- POS push handler converts client RFC3339 `trx_at` via `toMysqlDateTimeStrict(tx.trx_at)` storing as DATETIME
- Server interprets client-supplied timestamp in server-local timezone
- No timezone preservation for business reporting queries

## Acceptance Criteria

- [ ] `pos_transactions.trx_at` stored as BIGINT unix ms (not MySQL DATETIME) in schema
- [ ] POS push handler converts client RFC3339 `trx_at` to unix ms via `toEpochMs(toUtcInstant())` before insert
- [ ] `client_tx_id` uniqueness enforced per `company_id + outlet_id` composite
- [ ] POS pull response uses `data_version` (not `sync_data_version` alias)
- [ ] No `new Date()` in POS sync write path (use `toEpochMs(nowUTC())` from shared)

## Tasks/Subtasks

- [ ] 3.1 Audit `PosTransactions` interface in `packages/db/src/kysely/schema.ts` — confirm `trx_at` type
- [ ] 3.2 Add migration to add `trx_at_ts BIGINT` column to `pos_transactions` (additive, guarded)
- [ ] 3.3 Update `packages/pos-sync/src/push/index.ts` to convert client RFC3339 `trx_at` to epoch ms before insert
- [ ] 3.4 Verify `client_tx_id` composite unique index on `(company_id, outlet_id, client_tx_id)` exists
- [ ] 3.5 Audit POS pull response schema — verify uses `data_version` not alias
- [ ] 3.6 Search `packages/pos-sync/src/` for `new Date()` in write paths — must be zero
- [ ] 3.7 Add integration test: push same `client_tx_id` twice → first OK, second DUPLICATE, single journal
- [ ] 3.8 Run `npm run test:integration -w @jurnapod/pos-sync -- --grep "trx_at|timestamp|client_tx_id" --run`

## Dev Notes

- **Scope constraint**: `apps/pos` is frozen — this story operates on server-side packages only (`packages/pos-sync`, `packages/db`, `packages/shared`)
- `client_tx_id` uniqueness must be scoped to `company_id + outlet_id` — the unique constraint `(company_id, client_tx_id)` alone is insufficient if same `client_tx_id` could appear across outlets
- The conversion path for client RFC3339 to epoch ms: `toEpochMs(toUtcInstant(tx.trx_at))` — this validates the RFC3339 string and converts to UTC epoch ms
- POS pull uses `data_version` per canonical sync contract — no alias fields

## Validation Commands

```bash
npm run test:integration -w @jurnapod/pos-sync -- --grep "trx_at|timestamp|client_tx_id" --run
rg "new Date\(\)" packages/pos-sync/src/ --type ts
# Expected: zero occurrences in write paths
```

## File List

```
packages/db/src/kysely/schema.ts
packages/pos-sync/src/push/index.ts
packages/db/src/migrations/
```

## Change Log

- (none yet)

## Dev Agent Record

- (none yet)