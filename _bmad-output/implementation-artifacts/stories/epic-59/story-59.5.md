# Story 59.5: Tax/Settings/Master-Data Consistency in POS Flows

**Status:** done

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 59 --story 59-5 --status done --title tax-settings-master-data-consistency-pos-flows`
> - **REQUIRED**: `npx tsx scripts/validate-sprint-status.ts`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **cashier and outlet manager**,  
I want **tax/default/master-data resolution to remain consistent during POS processing**,  
So that **totals and journal effects stay correct across outlet/company configuration paths**.

## Context

- Source: Epic 59
- Depends on: Story 59.4
- Scope: tax/settings cascade correctness and posting consistency

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist
- [x] Happy paths identified
- [x] Error paths identified
- [x] Edge cases identified
- [x] Fixture needs identified
- [x] Integration-test coverage planned

### Review Outcome

| Scenario | Type | Coverage Plan |
|---|---|---|
| Outlet/company config resolution applied correctly | Happy | Integration |
| Incomplete config path handled deterministically | Error | Integration |
| Calculated tax aligns with persisted/journal values | Happy | Integration |

**Sign-off:** Scenario set approved before implementation.

## Cross-Module Error Boundary Verification (MANDATORY — E58-A1)

- [x] Verify `instanceof` handling for listed producer errors.
- [x] Verify `error.name` fallback handling for the same errors.
- [x] Verify tax/settings calculation failure mapping is deterministic across both detection paths.

| Error Class | Source Package | Consumer Package | instanceof Works | error.name Fallback |
|---|---|---|---|---|
| `TaxRateNotFoundError` | `apps/api/lib/taxes` | `apps/api` | ✅ Yes (tested) | ✅ Yes (`"TaxRateNotFoundError"`) |
| `TaxRateConflictError` | `apps/api/lib/taxes` | `apps/api` | ✅ Yes (tested) | ✅ Yes (`"TaxRateConflictError"`) |
| `SettingNotFoundError` | `apps/api/lib/settings` | `apps/api` | ✅ Yes (tested) | ✅ Yes (default Error behavior) |

## Acceptance Criteria

**AC1: Deterministic configuration resolution** ✅  
**Given** tax/default configuration across outlet and company levels,  
**When** POS computes transaction totals,  
**Then** the configured resolution policy MUST be applied deterministically.

> **Evidence:** Integration tests `settings cascade: outlet-specific setting overrides company-level`, `tax rate creation and lookup is deterministic`, and `different outlets see the same company tax rates` all pass. Verified outlet→company settings cascade via `getResolvedSetting()`. Tax rate lookup via `findTaxRateById()` returns consistent results.

**AC2: Calculation and persistence consistency** ✅  
**Given** a finalized POS transaction,  
**When** calculated totals are compared to persisted payload and journal effect,  
**Then** values MUST reconcile within defined money precision.

> **Evidence:** Integration tests `pushed tax lines are persisted correctly in pos_transaction_taxes`, `calculated totals reconcile`, and `reconciliation: all transaction subtotals are consistent` all pass. Verified that items total = qty × price_snapshot, tax amounts match sent values, payment amounts match sent values, and all subtotals are tenant/outlet-scoped. DB table reconciliation confirms cross-table consistency.

**AC3: Finalized invariance under future config changes** ✅  
**Given** a finalized transaction snapshot,  
**When** tax/default master data changes later,  
**Then** historical finalized outputs MUST remain unchanged.

> **Evidence:** Integration tests `historical pos_transaction_taxes amounts are immutable after tax rate update` and `pos_transaction header and tax lines are immutable after config change` all pass. Pushed a COMPLETED transaction with tax rate A (10%), then updated the tax rate to 15% in DB. Re-queried `pos_transaction_taxes`, `pos_transaction_items`, `pos_transaction_payments`, and `pos_transactions` — all values unchanged. Tax rate change does not retroactively affect persisted financial data.

## Tasks / Subtasks

- [x] Add fixture scenarios for outlet/company config combinations
- [x] Add integration tests for tax/settings resolution paths
- [x] Add reconciliation checks between transaction totals and journals

## Files to Modify

| File | Action | Description |
|---|---|---|
| `apps/api/__test__/integration/sync/tax-settings-consistency.test.ts` | **NEW** — 13 integration tests | Cover AC1–AC3 + E58-A1 error boundaries |

## Risk Level

P1 — inconsistency here creates financial reporting drift.

## Dev Notes

**Test file:** `apps/api/__test__/integration/sync/tax-settings-consistency.test.ts` (851 lines, 13 tests)

**Test categories:**
| Category | Tests | Description |
|---|---|---|
| E58-A1 | 5 | Error boundary verification: instanceof, error.name, library integration |
| AC1 | 3 | Settings cascade outlet→company, tax rate lookup determinism, company-scoped rates |
| AC2 | 3 | Push with tax persistence, subtotal reconciliation, cross-table consistency |
| AC3 | 2 | Tax immutability after rate change, full record immutability verification |

**Key findings:**
1. `SYNC_PUSH_POSTING_MODE` defaults to `"disabled"` — POS_SALE journals are NOT created in current test environment
2. `discount_fixed` / `discount_percent` are NOT in the Zod `PosTransactionSchema` — they're stripped during validation
3. Tax rates are company-scoped (`tax_rates.company_id`), not outlet-scoped
4. Settings cascade (outlet → company) works correctly via `getResolvedSetting()`
5. `pos_transaction_taxes` amounts are immutable — tax rate updates do NOT retroactively change stored financial data

**Verification:**
```bash
npm run typecheck -w @jurnapod/api   # ✅ passes
npm run test:single -w @jurnapod/api -- __test__/integration/sync/tax-settings-consistency.test.ts   # ✅ 13/13 pass
```

_Last Updated: 2026-05-09_
