# Remediation Note (Condition 1)

## Context

- Scope: `company_id=1`, `outlet_id=1`
- Run date (UTC): 2026-02-22

## Initial failure

First execute attempt failed with:

- `OUTLET_ACCOUNT_MAPPING_MISSING:CASH,QRIS,SALES_REVENUE,SALES_TAX,AR`

Affected `pos_transaction_id` values in failed run:

- `49`
- `162`

## Remediation applied

Created missing `outlet_account_mappings` keys for scope `(company_id=1, outlet_id=1)`:

- `CASH`
- `QRIS`
- `SALES_REVENUE`
- `SALES_TAX`
- `AR`

## Post-remediation verification

- Execute backfill succeeded: `execute.inserted=2`, `execute.failed=0`
- Execute rerun converged: `execute.inserted=0`, `execute.failed=0`
- Reconciliation passed: `reconcile.status=PASS`
