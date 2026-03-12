# Phase 5 Rollout Runbook (Tax Decoupling + Payment Variance + Cash/Bank)

## 1) Scope

This runbook governs production rollout for:
- Tax account decoupling (ADR-0007 Part A)
- Payment variance forex delta (ADR-0008)
- Cash & bank operations (ADR-0007 Part B)

Non-goals:
- Full multicurrency ledger revaluation
- Historical accounting restatement

## 2) Preconditions

- Migrations `0083` to `0087` applied on staging and validated rerunnable.
- API + backoffice builds are green.
- Integration tests for ACL and posting pass.
- On-call engineer and finance ops contact are assigned.

## 3) Rollout Waves

### Wave 1 (Pilot)
- Internal/sandbox + selected pilot companies
- Duration: 24 hours minimum
- Required checks:
  - `journal_unbalanced_count = 0`
  - No P1 auth/posting incidents
  - Finance ops confirms expected journal outcomes

### Wave 2 (Low-Risk Cohort)
- Low-volume, low-complexity companies
- Duration: 24 to 48 hours
- Required checks:
  - Stable error trend
  - No duplicate posting evidence
  - Tax/account configuration issues are manageable

### Wave 3 (General Availability)
- Remaining companies after Wave 1/2 criteria pass

## 4) Monitoring Signals

Core temporary metrics:
- `tax_account_missing_count`
- `cash_bank_post_failures_by_type`
- `payment_variance_posted_amount`

Correctness guard metrics:
- `journal_unbalanced_count` (must remain zero)
- `duplicate_post_attempt_count`
- `cash_bank_void_count`

## 5) Alert Policy (First 14 Days)

P1:
- `journal_unbalanced_count > 0` in any 15-minute window
- sustained spike in `duplicate_post_attempt_count`

P2:
- elevated `tax_account_missing_count` by company/day
- elevated `cash_bank_post_failures_by_type` for any transaction type

## 6) Incident Triage

1. Classify severity (P1/P2)
2. Identify blast radius (company/outlet/routes/features)
3. Freeze rollout to next wave
4. Mitigate:
   - Disable affected UI path if needed
   - Keep schema; revert feature code path if required
5. Reconcile:
   - Check journal balance
   - Check duplicate posting by idempotency/document keys
6. Publish incident update with ETA and resolution notes

## 7) Verification Commands

```bash
cd apps/api && node --test --import tsx src/lib/phase4.contracts.test.ts
cd apps/api && node --test tests/integration/tax-rates.acl.integration.test.mjs tests/integration/sales-payments.acl.integration.test.mjs tests/integration/cash-bank.acl.integration.test.mjs
cd apps/api && npm run lint && npm run typecheck
```

## 8) Sign-Off

- Backend owner: ____________________
- QA owner: _________________________
- DevOps owner: _____________________
- Finance ops owner: ________________
- Go-live timestamp: ________________
