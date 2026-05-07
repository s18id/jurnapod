# Story 58.3: Costing Method Correctness

**Status:** planned

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 58 --story 58-3 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

---

## Story

As a **financial controller**,  
I want **the inventory costing method (FIFO, Average, LIFO) to produce correct COGS and inventory values**,  
So that **financial statements reflect accurate cost of goods sold and ending inventory**.

---

## Context

**Source:** Epic 58 kickoff; Sprint 58 baseline

**Background:** Story 58.1 establishes item type taxonomy. Story 58.2 establishes stock movement scoping. Story 58.3 proves the costing methods (FIFO, Average, LIFO) produce correct COGS and inventory values. This is a P0 story — correctness of costing directly impacts financial statement accuracy.

**Key facts:**
- FIFO: First-In-First-Out — oldest cost layers consumed first
- Average: Weighted average cost at time of sale
- LIFO: Last-In-First-Out — newest cost layers consumed first
- Standard costing: variance-tracking overlay — core LIFO/Average/FIFO still applies
- Partial layer consumption: remaining quantity carries forward to next available layer
- Cost layers: each purchase creates a new cost layer with `quantity` and `unit_cost`

**Predecessor:** Stories 58.1 and 58.2 complete

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:**
  1. FIFO: COGS uses oldest layers first
  2. Average: COGS uses weighted average at time of sale
  3. LIFO: COGS uses newest layers first
  4. Partial layer: remaining quantity carries forward after sale
  5. Standard costing: price variance recorded separately from COGS
- [ ] **Error paths identified:**
  1. Negative cost layer (should not exist — validate at purchase time)
  2. Zero quantity layer (should be skipped)
  3. Missing cost layers for item (should use configured default or error)
- [ ] **Edge cases identified:**
  1. Single layer: all quantity sold from one layer
  2. Multiple partial layers: first layer partially consumed, second fully consumed
  3. LIFO reversal: selling when newest layers partially consumed
  4. Standard variance: actual price > standard price (favorable), actual < standard (unfavorable)
- [ ] **Test fixture needs identified:** Cost layer fixtures with known quantities and dates/prices
- [ ] **Integration test scope:** Costing calculation tests can be unit tests with mocked DB; COGS posting tests need real DB
- [ ] **Negative auth test role:** N/A (costing calculation is domain logic, not permission-gated)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| FIFO: oldest layer consumed first | Happy | Unit |
| FIFO: multiple layers, correct order | Happy | Unit |
| Average: weighted average at sale time | Happy | Unit |
| LIFO: newest layer consumed first | Happy | Unit |
| LIFO: reverse chronological order | Happy | Unit |
| Partial layer: remaining qty carries forward | Happy | Unit |
| Standard: variance captured separately | Happy | Unit |
| Single layer: all qty sold | Edge | Unit |
| Multiple partial layers | Edge | Unit |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Acceptance Criteria

**AC1: FIFO costing**
**Given** a company configured with FIFO costing,
**When** items are sold,
**Then** COGS MUST be calculated using the oldest First-In-First-Out cost layers.

**AC2: Average costing**
**Given** a company configured with Average costing,
**When** items are sold,
**Then** COGS MUST be calculated using the weighted average cost at time of sale.

**AC3: LIFO costing**
**Given** a company configured with LIFO costing,
**When** items are sold,
**Then** COGS MUST be calculated using the most recent Last-In-First-Out cost layers.

**AC4: LIFO layer consumption order**
**Given** multiple purchases at different prices,
**When** the costing method is LIFO,
**Then** the cost layers MUST be consumed in reverse chronological order (newest first).

**AC5: Partial layer carry-forward**
**Given** a cost layer is partially consumed (selling less than the layer quantity),
**When** the next sale occurs,
**Then** the remaining quantity of that layer MUST carry forward to the next available layer.

**AC6: Standard costing price variance**
**Given** a company configured with Standard costing,
**When** items are purchased at different prices than standard,
**Then** the system MUST record the price variance separately from the standard cost.
**Note:** Standard costing is a variance-tracking method; the core LIFO/Average/FIFO layer consumption still applies. Standard costing correctness requires validating that price variances are captured and reported correctly, not that COGS is calculated differently.

---

## Test Coverage Criteria

- [ ] Coverage target: all costing method paths + variance capture
- [ ] Happy paths to test:
  - [ ] FIFO: single layer, multiple layers, partial consumption
  - [ ] Average: single purchase, multiple purchases, weighted calculation
  - [ ] LIFO: single layer, multiple layers, reverse order
  - [ ] Standard: variance = actual - standard, favorable/unfavorable recorded
- [ ] Error paths to test:
  - [ ] No cost layers: fallback behavior (configured default or error)
  - [ ] Zero/negative quantities: skipped or error
- [ ] Edge cases to test:
  - [ ] Single item, single layer, full quantity sold
  - [ ] Single item, multiple layers, varying quantities
  - [ ] Standard variance sign: favorable (> standard cost) and unfavorable (< standard cost)

---

## Test Fixtures

### Pre-Implementation Checklist
- [ ] New patterns identified: cost layers with quantity, unit_cost, purchase_date
- [ ] Existing canonical fixtures reviewed: inventory item fixtures from 58.1
- [ ] Fixture location: `packages/modules/inventory-costing/src/test-fixtures/` (owner package)

### Fixture Creation/Update
- [ ] **New fixtures needed:**
  - [ ] `createTestCostLayer(companyId, itemId, quantity, unitCost, purchaseDate)` — individual cost layer
  - [ ] `createTestCostLayerSet(companyId, itemId, layers[])` — multiple layers for same item
  - [ ] `createTestStandardCostingSetup(companyId, itemId, standardCost)` — standard cost configuration
  - [ ] `createTestVarianceRecord(itemId, actualCost, standardCost, quantity)` — variance record fixture
- [ ] **Existing fixtures to update:**
  - [ ] None anticipated (new domain)

---

## Tasks / Subtasks

- [ ] Implement FIFO costing method: `calculateFIFOCOGS(layers, quantitySold)`
- [ ] Implement Average costing method: `calculateAverageCOGS(layers, quantitySold)`
- [ ] Implement LIFO costing method: `calculateLIFOCOGS(layers, quantitySold)`
- [ ] Implement partial layer carry-forward logic
- [ ] Implement Standard costing variance capture
- [ ] Create cost layer fixtures in `modules/inventory-costing`
- [ ] Write unit tests for all costing methods
- [ ] Run `test:unit:costing`
- [ ] Code review with no P0/P1 blockers

---

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/inventory-costing/src/test-fixtures/cost-layer-fixtures.ts` | Fixtures for cost layers and costing configuration |
| `packages/modules/inventory-costing/src/test-fixtures/index.ts` | Re-exports for all costing test fixtures |
| `packages/modules/inventory-costing/__test__/unit/costing-methods.test.ts` | Unit tests for FIFO, Average, LIFO methods |
| `packages/modules/inventory-costing/__test__/unit/standard-costing.test.ts` | Unit tests for Standard costing variance |

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/inventory-costing/src/index.ts` | Modify | Export costing calculation functions |
| `packages/modules/inventory-costing/src/test-fixtures/index.ts` | Modify | Export new fixtures |

---

## Estimated Effort

4 days (FIFO/Average/LIFO implementation + unit tests + variance tracking)

## Risk Level

Critical (P0 — costing correctness directly impacts financial statements; blocks Gate 1 and Gate 2)

---

## Dev Notes

- **Cost layer structure:** Each layer has `quantity` (remaining), `unit_cost`, and `purchase_date` or `layer_id` for ordering. FIFO orders by `purchase_date` ascending. LIFO orders by `purchase_date` descending. Average computes weighted average across all layers.
- **Partial consumption:** When a sale consumes only part of a layer, `remaining_qty` is decremented. The layer persists with reduced quantity.
- **Layer exhaustion:** When a layer is fully consumed, it is marked as fully consumed (or deleted). The next layer in order is used.
- **Average cost recalculation:** Average cost is recalculated at each sale based on current layers. It is NOT a running average — it is computed fresh at time of sale.
- **Standard costing:** `standard_cost` is stored per item. When purchase actual cost differs, variance is computed as `(actual_cost - standard_cost) × quantity`. Variance posted to variance account, not to COGS.
- **Company costing method:** Resolved from `settings_strings` with key `costing_method` or company-level default. Method is per-company setting.

---

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events: cost layer creation, COGS posting, variance posting
- [ ] Audit fields: `company_id`, `item_id`, `layer_id`, `quantity`, `unit_cost`, `costing_method`, `variance_amount`
- [ ] Audit tier: `OPERATIONAL`

### Idempotency
- [ ] Idempotency key field: N/A for costing calculation (deterministic given same inputs)
- [ ] Duplicate handling: N/A

### Validation Rules
- [ ] `unit_cost` must be positive (>= 0, reject negative)
- [ ] `quantity` must be positive
- [ ] `costing_method` must be one of: FIFO, AVERAGE, LIFO, STANDARD
- [ ] `standard_cost` must be positive for Standard costing items

### Error Handling
- [ ] Retryable errors: N/A (costing is synchronous calculation)
- [ ] Non-retryable errors: invalid costing method, negative unit cost
- [ ] Error codes: `COSTING_INVALID_METHOD`, `COSTING_NEGATIVE_UNIT_COST`

---

## Dependencies

- Story 58.1 complete (item types + recipe BOM)
- Story 58.2 complete (stock movements + scoping)

---

## Shared Contract Changes (MANDATORY)

> Applies when: story modifies shared constants, types, or contracts consumed by other packages/tests.

### Blast Radius Check (E33-A1)
Before marking complete, verify the change doesn't break consumers:

- [ ] Grep for all usages of costing functions in other packages
- [ ] Grep for all usages of `cost_layers` table in other packages
- [ ] Run consuming package tests — all must pass

### Consumer Audit Results

| Consumer File | Tested | Result |
|--------------|---------|--------|
| `packages/modules/inventory/src/...` | N/A | TBD |
| `apps/api/src/...` | N/A | TBD |
| `packages/modules/accounting/src/posting/cogs.ts` | N/A | TBD |

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] No `TODO`/`FIXME` comments left in production code
- [ ] No `as any` casts added without justification
- [ ] Unit tests included (not deferred)
- [ ] All new debt items added to registry

---

## Notes

**Why costing methods matter:** Incorrect COGS calculation directly misstates gross profit and ending inventory value. A 1% error in COGS on a $1M revenue company is a $10K misstatement.

**FIFO vs LIFO:** FIFO assumes oldest inventory sold first — typical for perishables and retail. LIFO assumes newest inventory sold first — typical for manufacturing and commodities. Average smooths price fluctuations.

**Standard costing variance:** When actual purchase price differs from standard cost, the difference is posted to a variance account. This allows tracking of purchase price efficiency without changing the COGS calculation itself.

**Average recalculation:** The weighted average is computed at time of each sale using the current state of all layers. It is NOT a moving average with a fixed calculation window.

_Last Updated: 2026-05-07_
