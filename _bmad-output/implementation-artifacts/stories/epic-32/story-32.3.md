# Story 32.3: Trial Balance Validation with Variance Reporting

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-32.3 |
| Title | Trial Balance Validation with Variance Reporting |
| Status | pending |
| Type | Feature |
| Sprint | 1 of 1 |
| Priority | P1 |
| Estimate | 4h |

---

## Story

As an Accountant,
I want to run a trial balance validation before closing a period,
So that I can catch and fix variances before they become permanent.

---

## Background

A trial balance lists all GL accounts with their debit/credit balances. Validation ensures total debits = total credits. Variance reporting shows which accounts have unusual movement vs prior periods or vs subledger expectations.

---

## Acceptance Criteria

1. Trial balance report: all accounts with debit/credit balances for a period
2. Validation: `SUM(debits) == SUM(credits)` — report passes/fails
3. Variance vs prior period: flag accounts with >X% change (configurable threshold)
4. Variance vs subledger: flag accounts where GL doesn't match subledger
5. GL imbalance check: run `checkGlImbalanceByBatchId()` across all batches in period
6. Pre-close checklist: list of items that must pass before close (imbalance=0, TB=balanced, variance < threshold)
7. Report includes: account code, name, debit, credit, balance, prior period balance, variance %
8. Tenant-scoped: `company_id` filter enforced
9. `npm run typecheck -w @jurnapod/api` passes

---

## Technical Notes

### Trial Balance Formula

```
Total Debits = Total Credits → ✅ Balanced
Total Debits ≠ Total Credits → ❌ Unbalanced (GL imbalance)
```

### Variance Threshold

```yaml
# config/slos.yaml (extend with trial balance section)
trial_balance:
  variance_warning_threshold: 0.10   # 10% change vs prior period
  variance_critical_threshold: 0.25  # 25% change triggers alert
```

### Integration with Epic 30

- Use `gl_imbalance_detected_total` to check for imbalances in period
- Alert via `AlertManager` if imbalances found
- Dashboard shows `journal_post_success_total` / `journal_post_failure_total` per domain

---

## Tasks

- [ ] Implement trial balance query (all accounts, debit/credit sums for period)
- [ ] Implement balance check (debits == credits)
- [ ] Implement prior-period variance calculation
- [ ] Implement GL vs subledger variance check
- [ ] Wire GL imbalance check into pre-close validation
- [ ] Build pre-close checklist endpoint
- [ ] Integration tests with real DB

---

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```
