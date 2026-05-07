# Story 58.4: Inventory-GL Reconciliation Correctness

**Status:** planned

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 58 --story 58-4 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

---

## Story

As an **accountant**,  
I want **inventory valuation and COGS to reconcile perfectly to GL journal entries**,  
So that **the inventory subledger matches the general ledger with zero material variance**.

---

## Context

**Source:** Epic 58 kickoff; Sprint 58 baseline

**Background:** Stories 58.1–58.3 establish item taxonomy, stock movement scoping, and costing methods. Story 58.4 proves inventory valuation and COGS reconcile to GL with zero material variance. This is a P0 story — Gate 1 and Gate 2 depend directly on this story's correctness.

**Key facts:**
- Inventory decrease on sale creates journal: debit COGS, credit inventory
- Sum of COGS journal lines must equal reported COGS for period
- Inventory subledger vs GL trial balance difference must be < $0.01
- Multi-currency purchases use exchange rate at purchase time

**Predecessor:** Stories 58.1, 58.2, 58.3 complete

**Scope note:** If multi-currency complexity exceeds single-agent session scope, split into:
- **58.4A** — Base-currency reconciliation mechanics (Gate 1 + Gate 2 formula validation)
- **58.4B** — Multi-currency reconciliation correctness

Both 58.4A and 58.4B remain within Epic 58 correctness scope (not net-new features).

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:**
  1. Inventory decrease on sale: journal entry debit COGS, credit inventory
  2. COGS journal lines sum equals reported COGS for period
  3. Inventory subledger balance vs GL inventory account: diff < $0.01
  4. Stock adjustment journal: debit/credit inventory variance account
- [ ] **Error paths identified:**
  1. Unbalanced journal (debits ≠ credits) — should never happen in production
  2. Missing COGS posting — subledger and GL diverge
  3. Wrong COGS GL account used — reconciliation fails
- [ ] **Edge cases identified:**
  1. Multi-currency purchase: cost in base currency at exchange rate from purchase date
  2. Historical cutoff: only transactions up to cutoff date included
  3. Zero COGS period: reconciliation passes with zero variance
- [ ] **Test fixture needs identified:** GL account fixtures, journal entry fixtures, reconciliation service fixtures
- [ ] **Integration test scope:** Reconciliation tests need real DB (subledger + GL comparison)
- [ ] **Negative auth test role:** Use `ACCOUNTANT` or dedicated test role (NOT `OWNER`/`SUPER_ADMIN`) for reconciliation tests

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Sale creates COGS journal: debit COGS, credit inventory | Happy | Integration |
| COGS journal sum equals subledger COGS | Happy | Integration |
| Inventory subledger vs GL: diff < $0.01 | Happy | Integration |
| Stock adjustment journal: debit/credit variance | Happy | Integration |
| Multi-currency: cost in base currency at rate from purchase date | Happy | Integration |
| Unbalanced journal detection | Error | Unit |
| Missing COGS posting detection | Error | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Acceptance Criteria

**AC1: Sale creates balanced COGS journal entry**
**Given** a POS or sales transaction that includes inventory items,
**When** the transaction is posted,
**Then** the inventory decrease MUST create a corresponding journal entry debiting COGS and crediting inventory.

**AC2: COGS journal lines sum equals reported COGS**
**Given** journal entries from inventory movements,
**When** running the inventory valuation report,
**Then** the sum of COGS journal lines MUST equal the reported COGS for the period.

**AC3: Inventory subledger vs GL difference < $0.01**
**Given** the GL trial balance is queried for inventory and COGS accounts,
**When** compared to the inventory subledger valuation,
**Then** the difference MUST be less than $0.01 (rounding tolerance) — per **Gate 1** of the Exit Gate contract.

**AC4: Stock adjustment journal entries**
**Given** a stock adjustment (shrinkage, damage, count variance),
**When** the adjustment is recorded,
**Then** the journal entry MUST debit/credit the appropriate inventory variance account.

**AC5: Multi-currency purchase cost conversion**
**Given** a multi-currency inventory purchase,
**When** the purchase is recorded,
**Then** the cost in base currency MUST be calculated using the exchange rate at time of purchase by calling `packages/modules/purchasing/src/services/exchange-rate-service.ts` as the canonical lookup path (backed by `exchange_rates` table, `rate` column as-of purchase date), rounded to 4 decimal places.

**InventoryReconciliationService modification:** Story 58.4 MUST modify `InventoryReconciliationService` to remove `LIMIT 1` on Level 2/3 GL account fallback queries and aggregate across all distinct resolved accounts instead.

---

## Test Coverage Criteria

- [ ] Coverage target: all reconciliation paths
- [ ] Happy paths to test:
  - [ ] Sale: COGS journal matches subledger
  - [ ] Transfer: no COGS impact (internal movement)
  - [ ] Adjustment: variance account used
  - [ ] Reconciliation: variance < $0.01
- [ ] Error paths to test:
  - [ ] 500: unbalanced journal detected
  - [ ] Reconciliation failure: variance >= $0.01
- [ ] Edge cases to test:
  - [ ] Multi-currency: exchange rate from purchase date
  - [ ] Zero COGS period: diff = 0
  - [ ] Historical cutoff: only pre-cutoff transactions

---

## Test Fixtures

### Pre-Implementation Checklist
- [ ] New patterns identified: GL account mapping, journal entry fixtures for COGS/inventory
- [ ] Existing canonical fixtures reviewed: `createTestItem`, `createTestCompanyMinimal`
- [ ] Fixture location: `packages/modules/accounting/src/test-fixtures/` (owner package for journal entries)

### Fixture Creation/Update
- [ ] **New fixtures needed:**
  - [ ] `createTestInventoryGLAccount(companyId, type)` — inventory asset account
  - [ ] `createTestCOGSAccount(companyId)` — COGS account
  - [ ] `createTestVarianceAccount(companyId)` — inventory variance account
  - [ ] `createTestCOGSJournalEntry(companyId, itemId, amount, timestamp)` — COGS posting fixture
  - [ ] `createTestInventoryReconciliationSummary(companyId, asOfDate)` — reconciliation result fixture
- [ ] **Existing fixtures to update:**
  - [ ] None anticipated (new domain for inventory-accounting bridge)

---

## Tasks / Subtasks

- [ ] Verify Stories 58.1, 58.2, 58.3 complete
- [ ] Modify `InventoryReconciliationService` to remove `LIMIT 1` and aggregate across all distinct GL accounts
- [ ] Create GL account fixtures (inventory, COGS, variance)
- [ ] Create journal entry fixtures for COGS/inventory postings
- [ ] Verify AC1: sale → COGS journal entry (debit COGS, credit inventory)
- [ ] Verify AC2: COGS journal sum = reported COGS
- [ ] Verify AC3: inventory subledger vs GL diff < $0.01
- [ ] Verify AC4: stock adjustment → variance account
- [ ] Implement AC5: multi-currency exchange rate from `exchange_rates` table at purchase date
- [ ] Run `test:integration:inventory` and `test:integration:inventory:posting`
- [ ] Verify Gate 1 and Gate 2 pass (manually or via gate script once 58.5 is complete)
- [ ] Code review with no P0/P1 blockers

---

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/__test__/integration/inventory/inventory-gl-reconciliation.test.ts` | Integration tests for inventory-GL reconciliation |
| `packages/modules/accounting/src/test-fixtures/journal-fixtures.ts` | GL journal entry fixtures for COGS/inventory |

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/accounting/src/reconciliation/subledger/inventory-reconciliation-service.ts` | Modify | Remove `LIMIT 1` on Level 2/3 fallback; aggregate across all accounts |
| `packages/modules/inventory/src/services/cogs-posting.ts` | Modify | Ensure COGS journal entry format matches reconciliation expectation |
| `packages/modules/purchasing/src/services/exchange-rate-service.ts` | Modify | Use canonical exchange-rate lookup for multi-currency purchase conversion |

---

## Estimated Effort

4 days (reconciliation logic + GL account resolution + multi-currency + gate validation)

## Risk Level

Critical (P0 — Gate 1 and Gate 2 depend on this story; financial statement correctness at stake)

---

## Dev Notes

- **GL account resolution (3-level fallback, aggregate across ALL resolved):**
  1. `settings_strings` WHERE `key = 'inventory_reconciliation_account_ids'` (JSON array of account IDs) — resolved per company
  2. Aggregate across all distinct `items.inventory_asset_account_id` values for the company (NOT `LIMIT 1` — the control balance is the sum of all distinct inventory asset accounts)
  3. `accounts.type_name IN ('INVENTORY','INVENTORY_ASSET','STOCK') AND company_id = ? AND a.is_active = 1`
- **Account logging:** Log which fallback level was used and which account IDs were resolved for auditability.
- **Cumulative vs period:** GL balance is cumulative ending balance (all-time total as of cutoff). NOT period-only delta.
- **Rounding:** Round at report boundary only; intermediate calculations use full precision.
- **COGS GL account resolution (3-level):**
  1. Per-item `items.cogs_account_id` (item-specific override)
  2. `account_mappings.mapping_key = 'COGS_DEFAULT' AND outlet_id IS NULL`
  3. `accounts.type_name IN ('COGS') AND company_id = ? AND a.is_active = 1`
- **Multi-currency exchange rate:** `exchange_rates` table with `rate` column (mid-rate), `effective_date`. Lookup by currency pair and `effective_date <= purchase_date`, order by `effective_date DESC`, take first row.
- **InventoryReconciliationService canonical path:** Gate 1 validation MUST use `InventoryReconciliationService.getInventoryReconciliationSummary()` as canonical computation.

---

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events: reconciliation runs, variance discoveries
- [ ] Audit fields: `company_id`, `as_of_date`, `subledger_balance`, `gl_balance`, `variance`, `resolution_level`
- [ ] Audit tier: `ANALYTICS`

### Idempotency
- [ ] Idempotency key field: N/A (reconciliation is read-only aggregation)
- [ ] Duplicate handling: N/A

### Validation Rules
- [ ] `company_id` must match authenticated company
- [ ] `as_of_date` must be valid business date
- [ ] GL accounts must be active (`is_active = 1`)
- [ ] Exchange rate must exist for currency pair and date

### Error Handling
- [ ] Retryable errors: N/A (read-only aggregation)
- [ ] Non-retryable errors: missing GL account, missing exchange rate
- [ ] Error codes: `RECONCILIATION_ACCOUNT_NOT_FOUND`, `EXCHANGE_RATE_NOT_FOUND`

---

## Dependencies

- Story 58.1 complete (item types)
- Story 58.2 complete (stock movements)
- Story 58.3 complete (costing methods)

---

## Shared Contract Changes (MANDATORY)

> Applies when: story modifies shared constants, types, or contracts consumed by other packages/tests.

### Blast Radius Check (E33-A1)
Before marking complete, verify the change doesn't break consumers:

- [ ] Grep for all usages of `InventoryReconciliationService` in other packages
- [ ] Grep for all usages of `inventory_asset_account_id` in queries
- [ ] Run consuming package tests — all must pass

### Consumer Audit Results

| Consumer File | Tested | Result |
|--------------|---------|--------|
| `scripts/validate-epic-58-gates.ts` | N/A | TBD |
| `apps/api/src/routes/...` | N/A | TBD |

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] No `TODO`/`FIXME` comments left in production code
- [ ] No `as any` casts added without justification
- [ ] Integration tests included (not deferred)
- [ ] All new debt items added to registry

---

## Notes

**Why reconciliation matters:** If inventory subledger ($100) doesn't match GL inventory account ($100.05), there's $0.05 unaccounted. Over many transactions, this compounds. The $0.01 tolerance is the maximum allowable variance for sprint exit.

**Cumulative vs period:** "Cumulative as-of cutoff" means both subledger and GL values are summed across all time up to the cutoff, not filtered to only this period's journal lines. This is a common source of confusion — ensure tests and queries use cumulative aggregation.

**Historical limitation:** `getInventorySubledgerBalance()` uses `remaining_qty` (current remaining quantity), which subtracts post-cutoff consumption. Historical past-date reconciliation will understate subledger balance. This is documented as scope limitation; resolving with historical snapshot is out-of-scope for Epic 58.

**Multi-currency scope split:** If AC5 (multi-currency) complexity exceeds session scope, split into 58.4A (base-currency only) and 58.4B (multi-currency). Both are correctness scope, not net-new features.

_Last Updated: 2026-05-07_
