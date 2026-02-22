# Reconciliation (Condition 1)

## Run metadata

- Run date (UTC): 2026-02-22
- Environment (prod/staging/etc): local validation
- Operator: OpenCode
- company_id: 1
- outlet_id (or `all`): 1

## Reconciliation execution evidence

- Command source: `docs/checklists/m6-release-conditions-checklist.md`
- Output log path (`*-reconciliation.log`): `docs/checklists/evidence/m6-pos-backfill/20260222T000000Z-company-1-outlet-1-reconciliation.log`

## Captured reconciliation results

- missing_after=0
- unbalanced_batches=0
- orphan_batches=0

## Pass/fail interpretation

Pass criteria for M6 Condition 1 reconciliation:
- `missing_after = 0`
- `unbalanced_batches = 0`
- `orphan_batches = 0`

Decision:
- Reconciliation status (`PASS`/`FAIL`): PASS
- If `FAIL`, describe unresolved critical rows and remediation owner: N/A

## Exceptions and approvals

- Known exceptions (if any, with explicit approval): none
- DBA reviewer: Ahmad (2026-02-22)
- QA reviewer: Ahmad (2026-02-22)
- Accounting reviewer: Wilda (2026-02-22)
