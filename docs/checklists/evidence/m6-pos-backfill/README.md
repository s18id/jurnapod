# M6 POS Backfill Evidence Pack

This folder stores execution evidence for M6 Release Condition 1:
- historical POS journal backfill run
- reconciliation SQL outputs
- operator approvals (DBA, QA, Accounting)

Do not place production secrets in committed files.

## Naming convention

Use UTC timestamp and scope in every file name:
- `<RUN_TS>-company-<COMPANY_ID>-outlet-<OUTLET_ID_OR_ALL>-<artifact>`

Example:
- `20260222T103500Z-company-1-outlet-all-backfill-run.md`
- `20260222T103500Z-company-1-outlet-all-dry-run.log`
- `20260222T103500Z-company-1-outlet-all-execute.log`
- `20260222T103500Z-company-1-outlet-all-execute-rerun.log`
- `20260222T103500Z-company-1-outlet-all-reconciliation.log`
- `20260222T103500Z-company-1-outlet-all-reconciliation.md`

## Required files per scope

1. Backfill run worksheet copied from `backfill-run-template.md`
2. Dry-run command output log (`*-dry-run.log`)
3. First execute command output log (`*-execute.log`)
4. Rerun execute command output log (`*-execute-rerun.log`)
5. Reconciliation command output log (`*-reconciliation.log`)
6. Reconciliation interpretation sheet copied from `reconciliation-template.md`

## Recommended operator flow

1. Copy `backfill-run-template.md` to a run-specific file name.
2. Run dry-run/execute/rerun commands from the checklist and save logs with naming convention above.
   - `npm run db:backfill:pos-journals -- --dry-run ...`
   - `npm run db:backfill:pos-journals -- --execute ...`
   - `npm run db:backfill:pos-journals -- --execute ...` (rerun)
3. Copy `reconciliation-template.md` to a run-specific file name.
4. Run reconciliation command, save output log, and fill pass/fail interpretation.
   - `npm run db:reconcile:pos-journals -- ...`
5. Record approver names and dates in the run worksheet.
6. Update `docs/checklists/m6-release-conditions-checklist.md` Condition 1 placeholders from PENDING to completed evidence references.
