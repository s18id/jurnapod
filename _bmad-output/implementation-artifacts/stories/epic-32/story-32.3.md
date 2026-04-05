# Story 32.3: Trial Balance Validation with Variance Reporting

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-32.3 |
| Title | Trial Balance Validation with Variance Reporting |
| Status | review |
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

- [x] Implement trial balance query (all accounts, debit/credit sums for period)
- [x] Implement balance check (debits == credits)
- [x] Implement prior-period variance calculation
- [x] Implement GL vs subledger variance check
- [x] Wire GL imbalance check into pre-close validation
- [x] Build pre-close checklist endpoint
- [x] Integration tests with real DB

---

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```

---

## Dev Agent Record

### Implementation

**Files Created:**
- `apps/api/src/lib/trial-balance-service.ts` — TrialBalanceService with:
  - `getTrialBalance()` — Returns all accounts with debit/credit balances for a period
  - `runPreCloseValidation()` — Returns pre-close checklist
  - `checkGlImbalanceByBatchId()` — Detects unbalanced batches
  - Period variance calculation (prior period balance comparison)
  - Subledger variance for CASH accounts
- `apps/api/src/lib/trial-balance-service.test.ts` — Integration tests

**Files Modified:**
- `apps/api/src/routes/admin-dashboards.ts` — Added two endpoints:
  - `GET /admin/dashboard/trial-balance` — Trial balance report
  - `GET /admin/dashboard/trial-balance/validate` — Pre-close validation
- `config/slos.yaml` — Added trial_balance section with variance thresholds

### Technical Approach

1. **TrialBalanceService** follows patterns from `ReconciliationDashboardService`:
   - Uses `KyselySchema` for type-safe queries
   - Resolves period range from fiscalYearId/periodId/asOfEpochMs
   - Aggregates journal_lines by account for period

2. **Variance Calculation:**
   - Prior period is calculated as the month before the current period
   - `percentChange = (currentBalance - priorBalance) / |priorBalance|`
   - Severity: OK (<10%), WARNING (10-25%), CRITICAL (>25%)

3. **GL vs Subledger:**
   - For CASH accounts: compares GL balance vs (journal_lines + cash_bank_transactions)
   - Follows the same pattern as `CashSubledgerProvider` in modules-accounting

4. **GL Imbalance Check:**
   - Groups journal_batches with journal_lines
   - HAVING SUM(debit) <> SUM(credit) identifies unbalanced batches

### Tests

Integration tests cover:
- Trial balance report with company-scoped data
- Balance validation (debits == credits)
- Period variance calculation
- Subledger variance detection
- GL imbalance detection (including unbalanced batch creation)
- Pre-close validation checklist
- Tenant isolation

### Notes

- TypeScript strict mode enabled — no type errors
- Uses `sql` template tag for complex queries (same pattern as reconciliation-dashboard.ts)
- Variance thresholds defined in `config/slos.yaml` with defaults as fallback
- Pre-close checklist includes: trial balance balanced, no GL imbalances, variance threshold, subledger reconciliation, new accounts review, fiscal year status
