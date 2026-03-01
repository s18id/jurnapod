<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# Backfill Run Template (Condition 1)

Copy this file per run scope and rename using the evidence naming convention.

## Run metadata

- Run date (UTC):
- Environment (prod/staging/etc):
- Operator:
- Change ticket/reference:

## Scope

- company_id:
- outlet_id (or `all`):
- limit (or empty):

## Commands executed

Use commands from `docs/checklists/m6-release-conditions-checklist.md`.

- Dry-run command:
- Execute command (first run):
- Execute command (rerun same scope):

## Counter capture

### Dry-run counters

- missing_candidates=
- reconcile_before.missing_completed_pos=
- reconcile_before.unbalanced_pos_sale_batches=
- reconcile_before.orphan_pos_sale_batches=

### Execute counters (first run)

- execute.inserted=
- execute.skipped_exists=
- execute.skipped_race_duplicate=
- execute.skipped_not_completed=
- execute.failed=
- reconcile_after.missing_completed_pos=
- reconcile_after.unbalanced_pos_sale_batches=
- reconcile_after.orphan_pos_sale_batches=

### Execute counters (rerun same scope)

- execute.inserted=0 (required)
- execute.failed=0 (required)

## Artifact paths

- dry run log:
- execute log:
- rerun log:
- reconciliation log:
- reconciliation interpretation sheet:

## Outcome and interpretation

- Backfill status (`PASS`/`FAIL`):
- Notes on skipped rows or known exceptions:

## Approvals

- DBA: name/date/signature
- QA: name/date/signature
- Accounting: name/date/signature
