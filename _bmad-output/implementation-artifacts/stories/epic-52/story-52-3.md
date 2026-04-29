# Story 52-3: POS Server-Side Timestamp Alignment

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 52-3 |
| Epic | Epic 52: Datetime Standardization + Idempotency Hardening |
| Title | POS Server-Side Timestamp Alignment |
| Status | review |
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

- [x] `pos_transactions.trx_at_ts` stored as BIGINT unix ms (canonical) in schema; legacy `trx_at` retained as compatibility bridge
- [x] POS push handler converts client RFC3339 `trx_at` to unix ms via `toEpochMs(toUtcInstant())` before insert
- [x] `client_tx_id` uniqueness enforced per `company_id + outlet_id` composite
- [x] POS pull response uses `data_version` (not `sync_data_version` alias)
- [x] No `new Date()` remains in POS sync transaction write path (`packages/pos-sync/src/push/index.ts`)

## Tasks/Subtasks

- [x] 3.1 Audit `PosTransactions` interface in `packages/db/src/kysely/schema.ts` — confirmed `trx_at` legacy DATETIME and added canonical `trx_at_ts` BIGINT field
- [x] 3.2 Add migration to add `trx_at_ts BIGINT` column to `pos_transactions` (additive, guarded)
- [x] 3.3 Update `packages/pos-sync/src/push/index.ts` to convert client RFC3339 `trx_at` to epoch ms before insert
- [x] 3.4 Verify `client_tx_id` composite unique index on `(company_id, outlet_id, client_tx_id)` exists
- [x] 3.5 Audit POS pull response schema — verify uses `data_version` not alias
- [x] 3.6 Search `packages/pos-sync/src/` for `new Date()` in write paths — zero in transaction write path
- [x] 3.7 Add integration test: push same `client_tx_id` twice → first OK, second DUPLICATE, single journal-effect row
- [x] 3.8 Run `npm run test:single -w @jurnapod/pos-sync -- __test__/integration/pos-sync-module.integration.test.ts`

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
packages/db/migrations/0197_pos_transactions_trx_at_ts_canonical.sql
packages/db/src/kysely/schema.ts
packages/sync-core/src/data/transaction-queries.ts
packages/pos-sync/src/push/index.ts
packages/pos-sync/__test__/integration/pos-sync-module.integration.test.ts
packages/modules/accounting/src/posting/cogs.ts
```

## Change Log

- 2026-04-29: Added canonical `trx_at_ts` BIGINT for `pos_transactions` with guarded backfill migration and canonical index.
- 2026-04-29: Aligned push ingestion to canonical epoch-ms conversion (`toEpochMs(toUtcInstant(...))`) and persisted `trx_at_ts`.
- 2026-04-29: Fixed runtime idempotency lookup scope to include `outlet_id` so behavior matches composite unique constraint.
- 2026-04-29: Added integration assertion for duplicate push: single persisted transaction row and deterministic canonical `trx_at_ts`.

## Dev Agent Record

- Implemented additive canonical timestamp alignment for POS transactions:
  - Added `trx_at_ts` as canonical unix-ms column (migration 0197)
  - Kept `trx_at` as compatibility bridge to avoid wide reporting breakage in this story
- Updated sync-core transaction query contracts:
  - Added `trx_at_ts` to insert/read models
  - Scoped idempotency reads by `(company_id, outlet_id, client_tx_id)`
- Updated POS push path to persist canonical timestamp:
  - `trx_at_ts = toEpochMs(toUtcInstant(tx.trx_at))`
- Updated COGS posting call site to pass epoch-ms saleDate value (removes `new Date()` from POS transaction write path)
- Added test coverage in existing integration suite:
  - duplicate push returns `DUPLICATE`
  - only one transaction row persisted
  - persisted `trx_at_ts` equals canonical epoch value
- Validation executed:
  - `npm run build -w @jurnapod/db`
  - `npm run build -w @jurnapod/modules-accounting`
  - `npm run build -w @jurnapod/sync-core`
  - `npm run typecheck -w @jurnapod/pos-sync`
  - `npm run build -w @jurnapod/pos-sync`
  - `npm run test:single -w @jurnapod/pos-sync -- __test__/integration/pos-sync-module.integration.test.ts`
