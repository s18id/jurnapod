# Reconciliation Template (Condition 1)

Copy this file per run scope and rename using the evidence naming convention.

## Run metadata

- Run date (UTC):
- Environment (prod/staging/etc):
- Operator:
- company_id:
- outlet_id (or `all`):

## Reconciliation execution evidence

- Command source: `docs/checklists/m6-release-conditions-checklist.md`
- Output log path (`*-reconciliation.log`):

## Captured reconciliation results

Fill from SQL output exactly.

- missing_after=
- unbalanced_batches=
- orphan_batches=

## Pass/fail interpretation

Pass criteria for M6 Condition 1 reconciliation:
- `missing_after = 0`
- `unbalanced_batches = 0`
- `orphan_batches = 0`

Decision:
- Reconciliation status (`PASS`/`FAIL`):
- If `FAIL`, describe unresolved critical rows and remediation owner:

## Exceptions and approvals

- Known exceptions (if any, with explicit approval):
- DBA reviewer: name/date/signature
- QA reviewer: name/date/signature
- Accounting reviewer: name/date/signature
