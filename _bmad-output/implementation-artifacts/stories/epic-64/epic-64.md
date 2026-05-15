# Epic 64: Test Production-Code Integration — Phase 2

**Status:** in-progress
**Sprint:** 64
**Theme:** Replace inline SQL aggregations in tests with production reconciliation/balance/reporting services. Every test verification that sums journal lines, computes subledger balances, or aggregates financial values MUST use the same production service that the API uses.
**Primary Modules:** `apps/api`, `packages/modules/accounting`, `packages/modules/treasury`, `packages/modules/purchasing`, `packages/modules/inventory-costing`
**Predecessor:** Epic 63 (Test Production-Code Hardening)
**Exit Gate:** Zero inline SQL aggregation in test verification paths; all critical suites green; `validate-sprint-status.ts` exits 0.

---

## 8) Code Review Findings

*Pending — to be filled during epic execution.*

---

## 1) Charter

### 1.1 Program Alignment

Epic 64 continues the S48–S62 Correctness-First Architecture Blueprint into Sprint 64. Building on:
- Epic 63 elimination of test stubs, inline production-code reimplementations, and raw SQL INSERTs for test setup
- Epic 62 projection correctness hardening (zero material variance in projections)
- Epic 61 GL reconciliation (AR/AP subledger truth)

### 1.2 What We Know

- Epic 63 eliminated test stubs and raw SQL INSERTs for setup, but a deeper audit revealed 9 P1 violations
- Tests still use inline `COALESCE(SUM(...)`, `CASE WHEN`, and raw SQL aggregation to verify financial balances
- These inline aggregations duplicate what production reconciliation, trial balance, and reporting services already compute
- Production services are available but some require export from their canonical packages
- Risk: if production formula changes, tests pass on stale math

### 1.3 Non-Goals

- No net-new features or reporting modules
- No frozen-app scope expansion (`apps/backoffice`, `apps/pos` remain frozen)
- No business-logic DB triggers
- No new per-epic gate scripts — use generic validators only
- No changes to production service formulas (use as-is)

---

## 2) Requirements Inventory

### Functional Requirements

| FR | Requirement | Enforcement |
|----|-------------|----------|
| FR1 | Every test verification that sums journal lines, computes subledger balances, or aggregates financial values MUST use the same production service the API uses | Code audit + test evidence |
| FR2 | Zero inline SQL aggregation in test verification paths | `grep -E 'COALESCE\(SUM|SUM\(.*\)'` across `__test__/` must return 0 for verification queries |
| FR3 | Production services required by tests MUST be exported from canonical packages | Import audit |
| FR4 | Test assertions MUST remain correct after migration to production services | All tests pass after migration |
| FR5 | COGS posting test fixtures MUST use canonical inventory fixtures, not inline INSERTs | Fixture audit |

### Non-Functional Requirements

| NFR | Requirement | Validation |
|-----|-------------|-----------|
| NFR1 | No regression in test runtime | Within 2× baseline |
| NFR2 | No changes to production service formulas | Code audit |
| NFR3 | All migrated tests use canonical fixture flow (Full Fixture Mode) | `lint:fixture-flow` clean |
| NFR4 | Machine-verifiable evidence of inline SQL elimination | `grep` gate passes |

---

## 3) Story Breakdown

### Story 64.1 — Fix ap-multicurrency-correctness: Use computePurchaseInvoiceOpenAmount
**Status:** planned
**Type:** P1 fix
**Risk:** Low
**FR Coverage:** FR1, FR4
**Dependencies:** None (service already exported)

`computePurchaseInvoiceOpenAmount` is already exported from `@jurnapod/modules-purchasing`. Replace the inline `SELECT (pi.grand_total * pi.exchange_rate - COALESCE(SUM(apl.allocation_amount), 0))` at line ~409 with the production function.

### Story 64.2 — Fix cogs-projection-reconciliation: Use JournalsService.getBatch
**Status:** planned
**Type:** P1 fix
**Risk:** Low
**FR Coverage:** FR1, FR4
**Dependencies:** None (service already available)

The test repeats `SELECT CAST(COALESCE(SUM(jl.debit), 0) AS DECIMAL(18,4))` 4 times (lines ~152, 191, 215, 237). Replace with `JournalsService.getBatch(batchId)` and sum lines in TypeScript.

### Story 64.3 — Fix inventory-valuation-projection: Use getAllItemsCostSummary
**Status:** planned
**Type:** P1 fix
**Risk:** Low
**FR Coverage:** FR1, FR4
**Dependencies:** None (service already exported)

`getAllItemsCostSummary()` is already imported. The test has a hand-rolled `COALESCE(SUM(l.remaining_qty * l.unit_cost), 0)` as a verification. Replace with calling the production function again or extracting the verification helper.

### Story 64.4 — Expose TrialBalanceService + Fix gl-trial-balance-reconciliation
**Status:** planned
**Type:** P1 fix + production export
**Risk:** Medium
**FR Coverage:** FR1, FR3, FR4
**Dependencies:** TrialBalanceService export (within story)

Export `TrialBalanceService` from `@jurnapod/modules-accounting` if not already exported. Replace inline `COALESCE(SUM(debit), 0) / SUM(debit-credit)` (lines ~274, 311) with service calls.

### Story 64.5 — Expose APReconciliationService + Fix ap-aging-projection-reconciliation
**Status:** planned
**Type:** P1 fix + production export
**Risk:** Medium
**FR Coverage:** FR1, FR3, FR4
**Dependencies:** APReconciliationService export (within story)

Export `APReconciliationService.getAPSubledgerBalance()` from `@jurnapod/modules-accounting`. Replace inline `COALESCE(SUM(pi.grand_total * pi.exchange_rate), 0)` (lines ~213, 351) with the service call.

### Story 64.6 — Expose ARReconciliationService + Fix sales-revenue-projection + ar-aging-projection
**Status:** planned
**Type:** P1 fix + production export
**Risk:** Medium
**FR Coverage:** FR1, FR3, FR4
**Dependencies:** ARReconciliationService export (within story)

Export `ARReconciliationService.getARSubledgerBalance()`. Replace inline GL revenue aggregation (lines ~216 in sales-revenue) and inline AR subledger (line ~115 in ar-aging) with service calls.

### Story 64.7 — Expose CashBankService Helpers + Fix cash-flow-consistency + treasury-balance-projection
**Status:** planned
**Type:** P1 fix + production export
**Risk:** High (most complex — massive inline SQL)
**FR Coverage:** FR1, FR3, FR4
**Dependencies:** CashBankService export (within story)

Export balance/transaction helpers from `@jurnapod/modules-treasury`. Replace massive inline cash-flow computation (lines ~167-274, 350-480, 550-610 in cash-flow-consistency) and inline treasury balance (lines ~146 in treasury-balance-projection) with service calls.

### Story 64.8 — Fix cogs-posting package test: Create inventory fixtures
**Status:** planned
**Type:** P1 fix
**Risk:** Medium
**FR Coverage:** FR5
**Dependencies:** None (independent — different package)

Replace gap-documented inline `INSERT INTO items/inventory_transactions/item_prices` functions (lines ~211-261 in `packages/modules/accounting/__test__/integration/posting/cogs-posting.test.ts`) with canonical fixtures from `packages/modules/inventory/test-fixtures/`.

### Story 64.9 — Full validation gate
**Status:** planned
**Type:** gate
**Risk:** Low
**FR Coverage:** FR2, NFR1, NFR3, NFR4
**Dependencies:** ALL stories (64.1–64.8)

Runs all gates (lint, typecheck, build, test, SOLID/DRY/KISS).

---

## 4) Epic Risk Register

| Risk ID | Severity | Description | Mitigation |
|---------|----------|-------------|-------------|
| R64-001 | P0 | Production services may compute differently than inline SQL | Compare outputs, adjust test assertions; document any discrepancy |
| R64-002 | P1 | ARReconciliationService may not exist as exportable class | Create thin wrapper if needed |
| R64-003 | P1 | CashBankService may not expose balance aggregation | Export or create helper |
| R64-004 | P1 | TrialBalanceService may not be exported | Add export to package index |
| R64-005 | P2 | Test runtime may increase from service overhead | Accept if within 2× baseline |

---

## 5) Preconditions

| # | Precondition | Enforcement | Status |
|---|--------------|-------------|--------|
| 1 | Epic 63 close + retro complete | sprint-status | ⏳ Pending |
| 2 | `npm run lint -w @jurnapod/api` passes (0 errors) | pre-flight gate | ⏳ Pending |
| 3 | `npm run typecheck -w @jurnapod/api` passes | pre-flight gate | ⏳ Pending |
| 4 | `npm run lint:migrations` exits 0 | CI gate | ⏳ Pending |
| 5 | Sprint-status validation passes | `validate-sprint-status.ts` | ⏳ Pending |
| 6 | SOLID/DRY/KISS kickoff gate scored | manual review | ⏳ Pending (kickoff gate) |

---

## 6) Exit Gate

1. **Correctness Gate:** All tests pass after migration. No assertion failures from formula differences.
2. **Inline SQL Gate:** `grep -E 'COALESCE\(SUM|SUM\(.*\)'` across `__test__/` for verification queries returns 0.
3. **Export Gate:** All required production services are exported from canonical packages.
4. **Fixture Gate:** `lint:fixture-flow` clean. No raw SQL INSERTs in test setup.
5. **SOLID/DRY/KISS Gate:** Full rescore passes at pre-close.

---

## 7) Validation Commands

```bash
# Pre-flight
npm run lint -w @jurnapod/api
npm run typecheck -w @jurnapod/api

# Inline SQL elimination check
grep -rE 'COALESCE\(SUM|CASE WHEN' apps/api/__test__/ packages/modules/*/__test__/ --include='*.test.ts' || echo "No inline aggregation found"

# Build
npm run build -w @jurnapod/modules-accounting
npm run build -w @jurnapod/modules-treasury
npm run build -w @jurnapod/modules-purchasing
npm run build -w @jurnapod/modules-inventory-costing
npm run build -w @jurnapod/api

# Tests
npm run test:integration -w @jurnapod/api
npm run test:integration -w @jurnapod/modules-accounting

# Fixture flow
npm run lint:fixture-flow -w @jurnapod/api

# Sprint status
npx tsx scripts/validate-sprint-status.ts --epic 64
```

---

_Last Updated: 2026-05-11T00:00:00Z_
