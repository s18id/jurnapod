<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Backfill Run (Condition 1)

## Run metadata

- Run date (UTC): 2026-02-22
- Environment (prod/staging/etc): local validation
- Operator: OpenCode
- Change ticket/reference: M6 release conditions

## Scope

- company_id: 1
- outlet_id (or `all`): 1
- limit (or empty):

## Commands executed

- Dry-run command: `npm run db:backfill:pos-journals -w @jurnapod/db -- --dry-run --company-id=1 --outlet-id=1`
- Execute command (first run): `npm run db:backfill:pos-journals -w @jurnapod/db -- --execute --company-id=1 --outlet-id=1`
- Execute command (rerun same scope): `npm run db:backfill:pos-journals -w @jurnapod/db -- --execute --company-id=1 --outlet-id=1`

## Counter capture

### Dry-run counters

- missing_candidates=2
- reconcile_before.missing_completed_pos=2
- reconcile_before.unbalanced_pos_sale_batches=0
- reconcile_before.orphan_pos_sale_batches=0

### Execute counters (first run)

- execute.inserted=2
- execute.skipped_exists=0
- execute.skipped_race_duplicate=0
- execute.skipped_not_completed=0
- execute.failed=0
- reconcile_after.missing_completed_pos=0
- reconcile_after.unbalanced_pos_sale_batches=0
- reconcile_after.orphan_pos_sale_batches=0

### Execute counters (rerun same scope)

- execute.inserted=0 (required)
- execute.failed=0 (required)

## Artifact paths

- dry run log: `docs/checklists/evidence/m6-pos-backfill/20260222T000000Z-company-1-outlet-1-dry-run.log`
- execute log: `docs/checklists/evidence/m6-pos-backfill/20260222T000000Z-company-1-outlet-1-execute.log`
- rerun log: `docs/checklists/evidence/m6-pos-backfill/20260222T000000Z-company-1-outlet-1-execute-rerun.log`
- reconciliation log: `docs/checklists/evidence/m6-pos-backfill/20260222T000000Z-company-1-outlet-1-reconciliation.log`
- reconciliation interpretation sheet: `docs/checklists/evidence/m6-pos-backfill/20260222T000000Z-company-1-outlet-1-reconciliation.md`
- remediation note: `docs/checklists/evidence/m6-pos-backfill/20260222T000000Z-company-1-outlet-1-remediation-note.md`

## Outcome and interpretation

- Backfill status (`PASS`/`FAIL`): PASS
- Notes on skipped rows or known exceptions: Initial execute attempt failed due missing outlet mappings; required mappings were created and execution then converged.

## Approvals

- DBA: Ahmad (2026-02-22)
- QA: Ahmad (2026-02-22)
- Accounting: Wilda (2026-02-22)
