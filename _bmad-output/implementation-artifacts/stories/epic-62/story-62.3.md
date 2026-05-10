# Story 62.3: Treasury & Sales Revenue Projection Accuracy

**Status:** done

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 62 --story 62-3 --title treasury-sales-revenue-projection-accuracy --status done`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **financial auditor**,
I want **treasury balance and sales revenue projections to match source-of-truth transaction data with zero variance**,
so that **cash-flow and revenue reporting is provably accurate**.

## Context

- **Source:** Epic 62 (FR1, FR4) — Projection Correctness Hardening
- **Predecessor:** Story 62.1 (AR/AP/GL), Story 62.2 (Inventory/COGS)
- **Scope:** `packages/modules/treasury`, `packages/modules/reporting`, `apps/api/src/routes/reports.ts`
- **Risk:** P1 — treasury and revenue errors affect P&L and cash-flow statements

## Acceptance Criteria

**AC1: Treasury balance projection matches source bank/cash transaction data**
**Given** a company with cash/bank transactions,
**When** treasury balance endpoints are called,
**Then** projected balance equals `SUM(amount)` from cash/bank transactions for the company,
**And** `variance == 0` in `__EPIC62_GATE__` JSON evidence.

**AC2: Sales revenue projection matches GL revenue accounts**
**Given** a company with posted sales transactions,
**When** the daily sales summary projection is called,
**Then** total revenue equals `SUM(credit)` from `journal_lines` WHERE `account_type = 'REVENUE'`,
**And** `variance == 0` in `__EPIC62_GATE__` JSON evidence.

**AC3: Cash-flow projection consistency**
**Given** a company with posted journal entries across cash and revenue accounts,
**When** cash-flow projection is generated,
**Then** opening balance + inflows - outflows equals closing balance,
**And** the closing balance matches the treasury balance projection (AC1).

**AC4: `__EPIC62_GATE__` evidence emitted for each reconciliation test**
**When** each integration test verifies variance == 0,
**Then** the test emits `__EPIC62_GATE__` JSON lines to stdout.

## Tasks / Subtasks

- [x] Task 1: Treasury balance reconciliation test (AC: 1, 4) — 4/4 pass
  - [x] 1.1 Create `apps/api/__test__/integration/reporting/treasury-balance-projection-reconciliation.test.ts`
  - [x] 1.2 Test zero-state: no transactions → balance 0
  - [x] 1.3 Test seeded data: cash deposits + withdrawals → projected balance matches raw SUM
  - [x] 1.4 Emit `__EPIC62_GATE__` JSON evidence
- [x] Task 2: Sales revenue reconciliation test (AC: 2, 4) — 5/5 pass
  - [x] 2.1 Create `apps/api/__test__/integration/reporting/sales-revenue-projection-reconciliation.test.ts`
  - [x] 2.2 Test zero-state: no sales → revenue 0
  - [x] 2.3 Test seeded data: journal_lines REVENUE → GL self-consistency check
  - [x] 2.4 Emit `__EPIC62_GATE__` JSON evidence
- [x] Task 3: Cash-flow consistency test (AC: 3, 4) — 13/13 pass
  - [x] 3.1 Create `apps/api/__test__/integration/reporting/cash-flow-consistency-reconciliation.test.ts`
  - [x] 3.2 Test opening + inflows - outflows == closing
  - [x] 3.3 Test closing balance matches treasury projection
  - [x] 3.4 Emit `__EPIC62_GATE__` JSON evidence

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/__test__/integration/reporting/treasury-balance-projection-reconciliation.test.ts` | Treasury balance vs cash/bank transactions |
| `apps/api/__test__/integration/reporting/sales-revenue-projection-reconciliation.test.ts` | Sales revenue vs GL revenue accounts |
| `apps/api/__test__/integration/reporting/cash-flow-consistency-reconciliation.test.ts` | Cash-flow internal consistency + closing match |

## Estimated Effort

2 days

## Risk Level

P1 — Revenue and cash-flow projections directly affect P&L and cash-flow statements.

## Dev Notes

### Pre-existing code to leverage

- `apps/api/src/routes/cash-bank-transactions.ts` — cash/bank transaction routes
- `apps/api/src/routes/reports.ts` — daily sales summary, worksheet endpoints
- `packages/modules/reporting/src/reports/services.ts` — `listDailySalesSummary()`
- `apps/api/__test__/integration/cash-bank/` — existing cash/bank integration tests (create, list, post, void)

### Treasury balance — source-of-truth query
```sql
SELECT CAST(SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE -amount END) AS DECIMAL(18,4)) AS balance
FROM cash_bank_transactions
WHERE company_id = :companyId AND status = 'POSTED'
```

### Sales revenue — source-of-truth query
```sql
SELECT CAST(SUM(jl.credit) AS DECIMAL(18,4)) AS total_revenue
FROM journal_lines jl
INNER JOIN accounts a ON a.id = jl.account_id
INNER JOIN account_types at ON at.id = a.account_type_id
WHERE jl.company_id = :companyId AND at.name = 'REVENUE'
```

## Dependencies

- Story 62.1 — establishes `__EPIC62_GATE__` pattern and test directory
- Story 62.2 — inventory/COGS patterns (isolated company, seeding)
- `packages/modules/treasury` — treasury operations
- `packages/modules/reporting` — sales/revenue projections

---

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
