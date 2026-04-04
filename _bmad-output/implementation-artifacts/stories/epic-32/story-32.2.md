# Story 32.2: Multi-Period Reconciliation Dashboard

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-32.2 |
| Title | Multi-Period Reconciliation Dashboard |
| Status | pending |
| Type | Feature |
| Sprint | 1 of 1 |
| Priority | P1 |
| Estimate | 4h |

---

## Story

As an Accountant,
I want a reconciliation dashboard that shows GL balances vs subledger balances across multiple periods,
So that I can identify discrepancies and track reconciliation status over time.

---

## Background

Epic 30 established observability for sync and financial posting. This story builds the reconciliation workspace using that foundation. The `reconciliation-service.ts` (53-line thin adapter) delegates to `modules-accounting`. The dashboard should show GL account balances vs subledger totals (e.g., inventory GL vs inventory subledger, cash GL vs bank subledger).

---

## Acceptance Criteria

1. Dashboard shows GL balance vs subledger balance for key accounts per period
2. Variance column shows difference (GL - subledger)
3. Period-over-period trend shown (current vs prior periods)
4. Reconciliation status per account: `RECONCILED`, `VARIANCE`, `UNRECONCILED`
5. Filter by fiscal year, period, account type, reconciliation status
6. Drill-down to journal entries causing variance
7. Epic 30 `gl_imbalance_detected_total` metric visible on dashboard
8. Tenant-scoped: `company_id` filter enforced
9. `npm run typecheck -w @jurnapod/api` passes

---

## Technical Notes

### Key Accounts to Reconcile

| Account Type | GL Table | Subledger |
|-------------|----------|------------|
| Cash | `journal_lines` | `bank_transactions` |
| Inventory | `journal_lines` | `items` stock valuation |
| Receivables | `journal_lines` | `credit_notes` + invoices |
| Payables | `journal_lines` | `supplier_invoices` |

### Dashboard Metrics (from Epic 30)

- `journal_post_success_total{company_id, domain}` — postings by domain
- `journal_post_failure_total{company_id, domain}` — failed postings
- `gl_imbalance_detected_total{company_id}` — imbalance count

### Route

`GET /admin/dashboards/reconciliation` — returns reconciliation snapshot

---

## Tasks

- [ ] Read `reconciliation-service.ts` and `modules-accounting` reconciliation
- [ ] Design reconciliation query: GL vs subledger per account type
- [ ] Build reconciliation dashboard endpoint in `routes/admin-dashboards.ts`
- [ ] Wire Epic 30 metrics into dashboard response
- [ ] Add variance drill-down (journal entries)
- [ ] Integration tests with real DB
- [ ] Run typecheck + build

---

## Validation

```bash
npm run typecheck -w @jurnapod/api
npm run build -w @jurnapod/api
```
