# POS Journal Backfill and Reconciliation

Use this runbook to backfill historical `COMPLETED` POS transactions that are missing `POS_SALE` journals, then verify reconciliation counters.

## Commands

- Dry run (default mode):
  - `npm run db:backfill:pos-journals -- --dry-run --company-id=1`
- Execute inserts (first pass):
  - `npm run db:backfill:pos-journals -- --execute --company-id=1`
- Execute rerun for idempotency confirmation:
  - `npm run db:backfill:pos-journals -- --execute --company-id=1`
- Reconcile final scoped state:
  - `npm run db:reconcile:pos-journals -- --company-id=1`

## Operator guard rails

- `--execute` now requires an explicit scope:
  - use `--company-id=<id>` for normal scoped runs
  - use `--all-companies` only when a full-scope run is intentional
- `--outlet-id=<id>` requires `--company-id=<id>`.
- `--limit` accepts positive integers up to `10000`.
- `--dry-run` and `--execute` are mutually exclusive.

## Common filters

- Company scope only:
  - `npm run db:backfill:pos-journals -- --dry-run --company-id=1`
- Company + outlet scope:
  - `npm run db:backfill:pos-journals -- --execute --company-id=1 --outlet-id=2`
- Bounded batch size:
  - `npm run db:backfill:pos-journals -- --execute --company-id=1 --limit=200`

## Reconciliation helper command

- Reconcile scoped data and print deterministic counters + sample IDs:
  - `npm run db:reconcile:pos-journals -- --company-id=1`
  - `npm run db:reconcile:pos-journals -- --company-id=1 --outlet-id=2`
- Output keys:
  - `reconcile.missing_after`, `reconcile.unbalanced_batches`, `reconcile.orphan_batches`
  - `sample.missing_pos_ids`, `sample.unbalanced_batch_ids`, `sample.orphan_batch_ids`
  - `reconcile.status=PASS|FAIL`
- Exit code behavior:
  - `0` when pass
  - `2` when reconciliation counters show unresolved gaps
  - `1` on command/runtime errors

## Key output counters

- Scope and candidate counters:
  - `mode`, `scope.company_id`, `scope.outlet_id`, `scope.limit`, `missing_candidates`
- Reconciliation before run:
  - `reconcile_before.missing_completed_pos`
  - `reconcile_before.unbalanced_pos_sale_batches`
  - `reconcile_before.orphan_pos_sale_batches`
- Dry run preview:
  - `dry_run.preview_pos_transaction_ids`
- Execute mode results:
  - `execute.inserted`
  - `execute.skipped_exists`
  - `execute.skipped_race_duplicate`
  - `execute.skipped_not_completed`
  - `execute.failed`
- Reconciliation after execute:
  - `reconcile_after.missing_completed_pos`
  - `reconcile_after.unbalanced_pos_sale_batches`
  - `reconcile_after.orphan_pos_sale_batches`

## Expected completion signal

- First execute run inserts only missing journals for the chosen scope.
- Re-run execute for the same scope should converge to no new inserts (`execute.inserted=0`) with no new failures.
