# Epic 58: Inventory/Costing Correctness

> **Owner:** Architecture Program (Correctness > Safety > Speed)
> **Status:** planned
> **Sprint:** 58 (per S48–S61 blueprint)
> **Theme:** Prove inventory valuation, stock movement, and costing calculation correctness with zero material mismatches in costing tests.
> **Primary Modules:** `modules-inventory`, `modules-inventory-costing`
> **Predecessor:** Epic 57 (AR + Treasury Correctness) — Story 57.2 must be complete before Story 58.2 starts
> **Exit Gate:** Three-gate structure (Inventory↔GL reconciliation ≤$0.01, COGS reconciliation ≤$0.01, sprint health with 3× consecutive green critical suites)

---

## 0) Epic 57 Unblock Evidence

Epic 57 (AR + Treasury Correctness) Story 57.2 must be complete before Story 58.2 starts:

| Item | Evidence | Status |
|------|----------|--------|
| AR payment credits treasury cash account | Story 57.2 AC2 — balanced journal for AR payment | TBD |
| Treasury handoff pattern proven | Story 57.4 — AR→treasury reconcile | TBD |
| Epic 57 Story 57.2 complete before 58.2 | Sprint-status.yaml timestamp | TBD |

**Concurrency rule:** Epic 57 and Epic 58 may run concurrently through Story 57.1 / Story 58.1 only. From Story 58.2 onward, Epic 57 Story 57.2 MUST be complete.

---

## 1) Charter

### 1.1 Program Alignment

Epic 58 is Sprint 58 in the S48–S61 Correctness-First Architecture Blueprint:

| Sprint | Blueprint Focus | Epic 58 Alignment |
|--------|-----------------|-------------------|
| 56 | Correctness infrastructure | **This epic's predecessor** — archive flow unblocked, trigger 0201 active |
| 57 | AR + Treasury correctness | **Parallel through Story 57.1 / 58.1; 58.2+ blocked by 57.2** |
| **58** | **Inventory/costing correctness** | **This epic** — inventory valuation, stock movement, costing methods |
| 59+ | POS, Tenant/ACL, Sync, etc. | Downstream correctness pipeline |

### 1.2 What We Know

**Epic 56 (done):** Correctness Infrastructure. Archive flow unblocked, trigger 0201 active, CI lint gate operational.

**Epic 57 (in progress):** AR + Treasury Correctness. AR invoice/payment posting, credit/void/refund, treasury handoff.

**Inventory context:** Inventory module is OPTIONAL per-company (per Module Enablement table). Stock tracking only for PRODUCTS and INGREDIENTS — SERVICE and RECIPE types are never stock-tracked.

**Costing context:** FIFO, Average, LIFO are the core costing methods. Standard costing is a variance-overlay applied on top of the core method — it does not replace FIFO/Average/LIFO layer consumption.

**Known shared invariants:**
- DECIMAL(18,2) for all monetary values — never FLOAT/DOUBLE
- Temporal polyfill for all datetime — never native Date
- Tenant isolation via `company_id AND outlet_id` on all data access
- Inventory must reconcile to journal entries (Accounting/GL at center)
- COGS posts via `packages/modules/accounting/src/posting/cogs.ts`
- Business invariants enforced in application code, not DB triggers

### 1.3 Non-Goals

- Net-new inventory or costing features (correctness hardening only)
- Changes to `apps/backoffice` or `apps/pos` (frozen per architecture-first scope freeze)
- New API endpoints — validate existing contracts only
- Historical as-of-date reconciliation (scope limitation documented in Gate 1)

---

## 2) Requirements Inventory

### Functional Requirements (Inventory/Costing-Specific)

| FR | Requirement |
|----|-------------|
| FR1 | The system must track stock levels for PRODUCTS and INGREDIENTS (inventory level 1+) |
| FR2 | The system must support item types: SERVICE, PRODUCT, INGREDIENT, RECIPE |
| FR3 | The system must support recipes (BOM) via recipe_ingredients for COGS calculation |
| FR4 | The system must support outlet-specific pricing via item_prices.outlet_id |
| FR5 | The system must enforce settings cascade: company-level defaults → outlet-level overrides |
| FR6 | The system must track stock movements scoped by outlet_id |
| FR7 | The system must support FIFO, Average, and LIFO costing methods for COGS calculation |
| FR8 | The system must reconcile inventory subledger valuation to GL with zero material variance |
| FR9 | The system must capture and report price variances when Standard costing is configured (variance-overlay on FIFO/Average/LIFO core methods) |

### Non-Functional Requirements (Epic 58 Scoped)

| NFR | Requirement | Validating Test Suite | Threshold |
|-----|-------------|----------------------|-----------|
| NFR1 | Exit gate tolerance: inventory↔GL reconciliation variance ≤ $0.01 | `test:unit:costing`, `test:integration:inventory` | variance ≤ $0.01 |
| NFR2 | Consistent valuation across all inventory modules — cross-module diff = 0 | `test:integration:inventory:posting` | zero diff |
| NFR3 | Invariants in app code, not DB triggers | `npm run lint:migrations` | exits 0 |
| NFR4 | Inventory write-path correctness proven | `test:integration:inventory:posting` | 3× consecutive green |
| NFR5 | Compound indexes verified | `test:integration:inventory:performance` | covering index, no full table scan |

### FR Coverage Map

| FR | Requirement | Story |
|----|-------------|-------|
| FR1 | Track stock levels for PRODUCTS and INGREDIENTS | 58.1, 58.2 |
| FR2 | Support item types: SERVICE, PRODUCT, INGREDIENT, RECIPE | 58.1 |
| FR3 | Support recipes (BOM) via recipe_ingredients for COGS | 58.1 |
| FR4 | Support outlet-specific pricing via item_prices.outlet_id | 58.2 |
| FR5 | Settings cascade: company-level → outlet-level | 58.2 |
| FR6 | Track stock movements scoped by outlet_id | 58.2 |
| FR7 | Support FIFO, Average, LIFO costing methods for COGS | 58.3 |
| FR8 | Reconcile inventory subledger valuation to GL with zero material variance | 58.4 |
| FR9 | Capture and report price variances when Standard costing is configured | 58.3 |

---

## 3) Story Breakdown

### Story 58.1 — Inventory Item & Recipe Correctness
**Status:** planned
**Type:** Item taxonomy and recipe composition correctness
**Risk:** P1 — base story for Epic 58; no dependencies
**FR Coverage:** FR1, FR2, FR3

Prove item types (SERVICE/PRODUCT/INGREDIENT/RECIPE) and recipe compositions (BOM) enforce correct stock tracking behavior.

**AC1:** PRODUCTS and INGREDIENTS have stock levels updated on stock movements
**AC2:** SERVICE and RECIPE items have no stock level updates on stock movements (no-op)
**AC3:** RECIPE items with recipe_ingredients use correct ingredient quantities for COGS
**AC4:** PRODUCT items with multiple recipe_ingredients aggregate all ingredient costs per configured costing method

---

### Story 58.2 — Stock Movement & Outlet Scoping Correctness
**Status:** planned
**Type:** Stock movement scoping and atomicity correctness
**Risk:** P1 — depends on 58.1; Epic 57 Story 57.2 must be complete before starting
**FR Coverage:** FR1, FR4, FR5, FR6
**Precondition:** Epic 57 Story 57.2 complete

Prove stock movements are correctly scoped by outlet and company, and reject negative-stock transactions atomically.

**AC1:** Stock movements scoped by `company_id AND outlet_id` (composite constraint)
**AC2:** Stock queries filter by `outlet_id` and return only outlet-specific quantities
**AC3:** Transfer from outlet A to outlet B atomically decreases A and increases B
**AC4:** Outlet-specific pricing resolved from `item_prices` filtered by `outlet_id` (fallback to company-level)
**AC5:** Stock reduction below zero rejected with `INSUFFICIENT_STOCK` error
**AC6:** Multi-item transaction with any negative-stock line rejected atomically — no partial stock updates

---

### Story 58.3 — Costing Method Correctness
**Status:** planned
**Type:** Costing method correctness
**Risk:** P0 — critical for financial statement accuracy; depends on 58.1, 58.2
**FR Coverage:** FR7, FR9

Prove FIFO, Average, LIFO costing methods produce correct COGS and inventory values. Standard costing correctness requires validating price variance capture, not different COGS calculation.

**AC1:** FIFO: COGS uses oldest First-In-First-Out cost layers
**AC2:** Average: COGS uses weighted average cost at time of sale
**AC3:** LIFO: COGS uses newest Last-In-First-Out cost layers
**AC4:** LIFO layers consumed in reverse chronological order
**AC5:** Partial layer consumption carries remaining quantity forward to next layer
**AC6:** Standard costing records price variance separately from standard cost (variance-overlay; core LIFO/Average/FIFO still applies)

---

### Story 58.4 — Inventory-GL Reconciliation Correctness
**Status:** planned
**Type:** Inventory-to-GL reconciliation correctness
**Risk:** P0 — gate validation depends on this story; depends on 58.1, 58.2, 58.3
**FR Coverage:** FR8

Prove inventory valuation and COGS reconcile perfectly to GL journal entries with zero material variance.

**AC1:** Inventory decrease on sale creates journal entry: debit COGS, credit inventory
**AC2:** Sum of COGS journal lines equals reported COGS for period
**AC3:** Inventory subledger vs GL trial balance difference < $0.01 (per Gate 1)
**AC4:** Stock adjustments debit/credit appropriate inventory variance account
**AC5:** Multi-currency purchase cost in base currency uses exchange rate at purchase time (rate from `exchange_rates` table, `rate` column, as-of purchase date, 4 decimal places)

**Scope note:** If multi-currency complexity exceeds single-agent session scope, split into 58.4A (base-currency) and 58.4B (multi-currency). Both remain within Epic 58 correctness scope.

---

### Story 58.5 — Gate Validation Automation & Evidence Scripts
**Status:** planned
**Type:** Sprint close automation
**Risk:** P2 — depends on 58.1, 58.2, 58.3, 58.4

Implement `scripts/validate-epic-58-gates.ts` for machine-verifiable exit gate evidence.

**AC1:** Script runs three critical test suites and parses `__EPIC58_GATE__` JSON lines
**AC2:** Gate 1 variance recomputed from numeric values (variance ≤ threshold)
**AC3:** Gate 2 COGS variance recomputed from numeric values (variance ≤ threshold)
**AC4:** NFR2 `cross_module_diff` must be exactly zero
**AC5:** Gate 3 sprint health recomputed: `p0_count == 0 && p1_count == 0 && critical_suites_green`
**AC6:** Exit 0 only when all gates pass; exit 1 with diagnostic on failure
**AC7:** Script integrated into CI — sprint cannot close without script passing 0

**Required function:** `getAllItemsCostSummary(companyId, db)` added to `@jurnapod/modules-inventory-costing` for NFR2 evidence.

---

## 4) Epic 58 Risk Register

| Risk | Severity | Mitigation | Status |
|------|----------|------------|--------|
| R58-001: Inventory↔GL reconciliation variance > $0.01 | P0 | Story 58.4 validates; gate script recomputes | planned |
| R58-002: COGS reconciliation variance > $0.01 | P0 | Story 58.4 validates; gate script recomputes | planned |
| R58-003: Cross-module valuation inconsistency (NFR2) | P0 | `getAllItemsCostSummary` added in 58.5; full-precision comparison | planned |
| R58-004: Negative stock allowed due to race condition | P1 | Story 58.2 AC5/AC6 atomic rejection; Story 58.4 integration test | planned |
| R58-005: Epic 57.2 not complete before 58.2 starts | P1 | Concurrency rule enforced; 58.1 can run in parallel | planned |
| R58-006: Standard costing variance-overlay not captured correctly | P1 | Story 58.3 AC6 validates price variance separate from COGS | planned |
| R58-007: Cost layer partial consumption carry-forward bug | P1 | Story 58.3 AC5 validates layer state across sales | planned |
| R58-008: Fixture gap for inventory domain | P2 | Story 58.1 creates fixtures in `modules-inventory` per owner-package model | planned |
| R58-009: Historical as-of-date reconciliation limitation | P2 | Documented in Gate 1 scope limitation; out-of-scope for Epic 58 | planned |

---

## 5) Preconditions

The following upstream correctness guarantees apply to Epic 58:

| # | Precondition | Enforcement |
|---|--------------|-------------|
| 1 | Epic 56 Archive Trigger Resolution (Story 56.1) | COMPLETE |
| 2 | Epic 56 CI Lint Gate (Story 56.2) | COMPLETE |
| 3 | Epic 57 AR/Treasury Handoff (Story 57.2) | MUST BE COMPLETE before Story 58.2 starts |
| 4 | Fixture Ownership Model active | Domain fixtures in owner packages |
| 5 | Test Script Infrastructure defined | VERIFIED — scripts defined in package.json files: `test:unit:costing` in modules-inventory-costing, `test:integration:inventory`, `test:integration:inventory:posting`, `test:integration:inventory:performance` in apps/api |
| 6 | Sprint 58 Kickoff SOLID/DRY/KISS Gate | PASS — scorecard below |

**Kickoff verification:** Run all four test scripts to verify npm script wiring before Story 58.1 starts. If any command fails to execute, escalate before Story 58.1 starts.

---

## 6) Exit Gate

All three conditions MUST be satisfied to close Sprint 58.

### Gate 1 — Inventory Valuation Reconciliation

```
|inventory_subledger_value − gl_inventory_balance| ≤ $0.01 (cumulative as-of cutoff)
```

- **GL balance:** Cumulative ending balance — all-time total as of period-end cutoff timestamp
- **Scope limitation:** Historical past-date reconciliation uses `remaining_qty` (current remaining), which understates subledger balance for past dates — documented, out-of-scope for Epic 58
- **GL account resolution (3-level fallback, aggregate across all resolved accounts):**
  1. `settings_strings` WHERE `key = 'inventory_reconciliation_account_ids'` (JSON array)
  2. Aggregate across all distinct `items.inventory_asset_account_id` values (NOT LIMIT 1)
  3. `accounts.type_name IN ('INVENTORY','INVENTORY_ASSET','STOCK') AND company_id = ? AND a.is_active = 1`
- **Account logging:** Gate script logs which fallback level used and which account IDs resolved
- **Canonical computation:** `InventoryReconciliationService.getInventoryReconciliationSummary()` — Story 58.4 removes `LIMIT 1` on Level 2/3 fallback

### Gate 2 — COGS Reconciliation

```
|cogs_subledger_total − sum(COGS_journal_lines)| ≤ $0.01 (cumulative as-of cutoff)
```

- **COGS GL account resolution (3-level fallback):**
  1. Per-item `items.cogs_account_id` (item-specific override)
  2. `account_mappings.mapping_key = 'COGS_DEFAULT' AND outlet_id IS NULL`
  3. `accounts.type_name IN ('COGS') AND company_id = ? AND a.is_active = 1`
- **Canonical computation:** Existing COGS posting/reconciliation in `packages/modules/accounting/src/posting/cogs.ts` (journal posting) and `packages/modules/inventory/src/services/cogs-posting.ts` (inventory-side COGS computation)

### Gate 3 — Sprint Health

- No unresolved P0/P1 at pre-close
- All **critical suites** 3× consecutive green: `test:unit:costing`, `test:integration:inventory`, `test:integration:inventory:posting`
- `npx tsx scripts/validate-sprint-status.ts --epic 58` exits 0
- `scripts/validate-epic-58-gates.ts` exits 0

### Evidence Collection Script Contract

**Script:** `scripts/validate-epic-58-gates.ts`

**Required output lines:**
```
__EPIC58_GATE__ {"version": 1, "gate": "GATE1", "variance": "0.0034", "threshold": "0.01", "pass": true}
__EPIC58_GATE__ {"version": 1, "gate": "GATE2", "variance": "0.0000", "threshold": "0.01", "pass": true}
__EPIC58_GATE__ {"version": 1, "gate": "NFR2", "cross_module_diff": 0, "pass": true}
__EPIC58_GATE__ {"version": 1, "gate": "GATE3", "p0_count": 0, "p1_count": 0, "critical_suites_green": true, "critical_suite_names": ["test:unit:costing", "test:integration:inventory", "test:integration:inventory:posting"], "pass": true}
```

---

## 7) Sprint 58 Kickoff Checkpoint

### 7.1 Pre-Flight Gate

Before starting Story 58.1, verify:
1. Epic 56 both stories done (`epic-56: done` in sprint-status.yaml)
2. `npm run lint:migrations` exits 0
3. `npx tsx scripts/validate-sprint-status.ts --epic 56` exits 0
4. Epic 57 Story 57.2 status known (concurrency rule: 58.2+ blocked until 57.2 complete)
5. Test scripts wired: `test:unit:costing`, `test:integration:inventory`, `test:integration:inventory:posting`, `test:integration:inventory:performance` — all execute without error

### 7.2 SOLID/DRY/KISS Baseline

| Principle | Item | Status | Notes |
|-----------|------|-------|-------|
| **SRP** | Each story targets one inventory/costing domain | PASS | Stories scoped to: 58.1 item/recipe taxonomy, 58.2 stock movement, 58.3 costing methods, 58.4 reconciliation, 58.5 gate automation |
| **OCP** | Costing methods (FIFO/Average/LIFO) extended without modifying core posting | PASS | Costing methods implemented as isolated strategy pattern in modules-inventory-costing; posting logic unchanged |
| **LSP** | Inventory write-path behaves consistently across item types | PASS | All stock movements route through shared `StockMovementService`; item type checked at entry point; no per-type code paths |
| **ISP** | Inventory, costing, accounting modules have focused interfaces | PASS | modules-inventory-costing owns costing calculation; modules-accounting owns journal posting; modules-inventory owns stock movements; interfaces cross module boundaries at established service ports |
| **DIP** | Inventory service depends on accounting journal abstraction | PASS | Stock movement → costing calculation → COGS posting pipeline uses abstraction layers; no direct inventory-to-journal coupling |
| **DRY** | COGS posting shared across inventory and sales modules | PASS | `packages/modules/accounting/src/posting/cogs.ts` is the journal posting source of truth; inventory-side calculation feeds this canonical posting path |
| **KISS** | Gate script uses existing test suites; no new testing framework | PASS | Gate script (`validate-epic-58-gates.ts`) runs existing npm scripts (`test:unit:costing`, `test:integration:inventory`, `test:integration:inventory:posting`) and parses existing `__EPIC58_GATE__` output; no new test framework introduced |

**Resolution note:** All SOLID/DRY/KISS items scored PASS at kickoff. No TBDs remain. Scorecard is final and closed for Sprint 58.

---

## 8) Validation Commands

```bash
# Pre-flight: verify test scripts wired
npm run test:unit:costing -w @jurnapod/modules-inventory-costing
npm run test:integration:inventory -w @jurnapod/api
npm run test:integration:inventory:posting -w @jurnapod/api
npm run test:integration:inventory:performance -w @jurnapod/api

# Story 58.1 — Inventory Item & Recipe Correctness
npm run test:single -- "apps/api/__test__/integration/inventory/item-recipe-correctness.test.ts" -w @jurnapod/api

# Story 58.2 — Stock Movement & Outlet Scoping
npm run test:single -- "apps/api/__test__/integration/inventory/stock-movement-outlet-scoping.test.ts" -w @jurnapod/api

# Story 58.3 — Costing Method Correctness
npm run test:single -- "packages/modules/inventory-costing/__test__/unit/costing-methods.test.ts" -w @jurnapod/modules-inventory-costing

# Story 58.4 — Inventory-GL Reconciliation
npm run test:single -- "apps/api/__test__/integration/inventory/inventory-gl-reconciliation.test.ts" -w @jurnapod/api

# Story 58.5 — Gate Validation Automation
npx tsx scripts/validate-epic-58-gates.ts

# Epic close gate
npx tsx scripts/validate-sprint-status.ts --epic 58
```

---

## 9) Epic 56–57 Knowledge Carry-Forward

| Epic 56 Pattern | Epic 58 Application |
|-----------------|---------------------|
| Archive trigger (0201) allows `status='ARCHIVED'` | Inventory snapshots (if any) use same archive pattern |
| CI lint gate (`npm run lint:migrations`) | NFR3: no new business-logic triggers in Epic 58 migrations |
| `archived_at`, `archive_version` tracking | Inventory audit trail follows same pattern |

| Epic 57 Pattern | Epic 58 Application |
|-----------------|---------------------|
| AR invoice debits receivable, credits revenue (balanced journal) | Inventory COGS: debit COGS, credit inventory (balanced journal) |
| AR payment debits cash/bank, credits receivable | COGS posting follows same debit/credit pattern |
| Tenant isolation (`company_id`) | Inventory movements and stock queries enforce `company_id AND outlet_id` |
| VOID/REFUND pattern for immutable records | Inventory corrections use VOID/ADJUSTMENT pattern |

---

_Last Updated: 2026-05-07_
