# Story 58.1: Inventory Item & Recipe Correctness

**Status:** planned

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 58 --story 58-1 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only

---

## Story

As a **system integrity auditor**,  
I want **item types (SERVICE/PRODUCT/INGREDIENT/RECIPE) and recipe compositions (BOM) to enforce correct stock tracking behavior**,  
So that **only PRODUCTS and INGREDIENTS are tracked for stock, and COGS calculations use correct recipe ingredient ratios**.

---

## Context

**Source:** Epic 58 kickoff; Sprint 58 baseline

**Background:** Epic 58 establishes inventory/costing correctness. Story 58.1 is the base story proving item type taxonomy and recipe composition work correctly. Item types determine whether stock is tracked. Recipe compositions (BOM) determine COGS calculation at time of sale.

**Key facts:**
- Inventory module is OPTIONAL per-company (per Module Enablement table)
- Stock tracking only for PRODUCTS and INGREDIENTS — SERVICE and RECIPE types are never stock-tracked
- Item types taxonomy enforced at item creation/update time
- Recipes (BOM) composition used for COGS calculation only at time of sale
- Standard costing is a variance-overlay on FIFO/Average/LIFO core methods — does not replace layer consumption

**Predecessor:** None (Epic 58 base story)

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:**
  1. PRODUCT item: stock level updated on stock movement
  2. INGREDIENT item: stock level updated on stock movement
  3. RECIPE item: COGS calculated using recipe_ingredients quantities and costing method
  4. PRODUCT with multiple recipe_ingredients: COGS aggregates all ingredient costs
- [ ] **Error paths identified:**
  1. SERVICE item: stock movement no-op (no stock update)
  2. RECIPE item: no stock tracking even if recipe has ingredients
  3. Missing recipe_ingredients for PRODUCT: no-op or error depending on product type
- [ ] **Edge cases identified:**
  1. Item type transition: what happens if PRODUCT → SERVICE? (should not affect existing stock)
  2. Empty recipe (no ingredients): COGS = 0
  3. Partial recipe ingredient data: missing quantity, missing unit
- [ ] **Test fixture needs identified:** Inventory item fixtures with type variations (PRODUCT, INGREDIENT, SERVICE, RECIPE), recipe_ingredients fixture
- [ ] **Integration test scope:** Tests for stock tracking need real DB; COGS calculation for recipes can be unit tested
- [ ] **Negative auth test role:** N/A (this story is domain logic correctness, not permission-gated)

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| PRODUCT stock tracked on movement | Happy | Unit + Integration |
| INGREDIENT stock tracked on movement | Happy | Unit + Integration |
| SERVICE item: no stock tracking | Happy | Unit |
| RECIPE item: no stock tracking | Happy | Unit |
| PRODUCT with recipe_ingredients: correct COGS by costing method | Happy | Unit |
| PRODUCT with multiple recipe_ingredients: aggregated COGS | Happy | Unit |
| Empty recipe: COGS = 0 | Edge | Unit |
| Item type transition edge case | Edge | Unit |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Acceptance Criteria

**AC1: PRODUCTS and INGREDIENTS have stock levels updated**
**Given** an item with type `PRODUCT` or `INGREDIENT`,
**When** the system processes a stock movement,
**Then** the stock level MUST be updated correctly in `item_stock` or equivalent table.

**AC2: SERVICE and RECIPE items have no stock level updates**
**Given** an item with type `SERVICE` or `RECIPE`,
**When** the system processes a stock movement,
**Then** the stock level MUST NOT be updated (no-op behavior).
**Clarification:** The `item_type` field is authoritative for stock-tracking eligibility. SERVICE and RECIPE items are never stock-tracked regardless of any `track_stock` setting. All stock movement logic MUST filter by item type and reject any movement targeting a SERVICE or RECIPE item.

**AC3: RECIPE items use correct recipe_ingredients quantities for COGS**
**Given** a `RECIPE` item with `recipe_ingredients` entries,
**When** COGS is calculated,
**Then** the calculation MUST use the correct ingredient quantities from the recipe composition.

**AC4: PRODUCT with multiple recipe_ingredients aggregates all ingredient costs**
**Given** a `PRODUCT` item with multiple `recipe_ingredients`,
**When** calculating COGS for a sale,
**Then** the system MUST correctly aggregate all ingredient costs per the configured costing method (FIFO/Average/LIFO).
**Note:** Standard costing is a variance-tracking overlay on the core costing method; it does not replace FIFO/Average/LIFO layer consumption.

---

## Test Coverage Criteria

- [ ] Coverage target: all paths (item type taxonomy + recipe BOM)
- [ ] Happy paths to test:
  - [ ] PRODUCT item: stock movement updates `item_stock`
  - [ ] INGREDIENT item: stock movement updates `item_stock`
  - [ ] RECIPE: COGS calculated from recipe_ingredients at sale time
  - [ ] PRODUCT with recipe: COGS = sum(ingredient_cost × quantity) per costing method
- [ ] Error paths to test:
  - [ ] SERVICE item: stock movement is no-op
  - [ ] RECIPE item: stock movement is no-op
- [ ] Edge cases to test:
  - [ ] Empty recipe (no ingredients): COGS = 0
  - [ ] Missing ingredient data: graceful handling

---

## Test Fixtures

**Complete this section if the story introduces new data patterns.**

### Pre-Implementation Checklist
- [ ] New patterns identified: item type taxonomy (SERVICE, PRODUCT, INGREDIENT, RECIPE) — needs canonical fixture
- [ ] Recipe composition (BOM) pattern identified — needs canonical fixture
- [ ] Existing canonical fixtures reviewed: `createTestItem`, `createTestVariant` from `@jurnapod/db/test-fixtures` or owner package
- [ ] Fixture location: `packages/modules/inventory/src/test-fixtures/` per owner-package model

### Fixture Creation/Update
- [ ] **New fixtures needed:**
  - [ ] `createTestInventoryItem(companyId, opts)` — item with type: PRODUCT|INGREDIENT|SERVICE|RECIPE
  - [ ] `createTestRecipeIngredient(itemId, ingredientId, quantity, unit)` — BOM entry
  - [ ] `createTestRecipeComposition(productId, ingredients[])` — full recipe setup
- [ ] **Existing fixtures to update:**
  - [ ] `createTestItem` in `modules-inventory` — add `type` field and stock-tracking behavior

---

## Tasks / Subtasks

- [ ] Verify test script infrastructure (`test:unit:costing`, `test:integration:inventory`) wired before implementation
- [ ] Create inventory item fixtures in `packages/modules/inventory/src/test-fixtures/`
- [ ] Create recipe composition fixtures (BOM) in same location
- [ ] Implement AC1: PRODUCT/INGREDIENT stock tracking verification
- [ ] Implement AC2: SERVICE/RECIPE no-op behavior verification
- [ ] Implement AC3: RECIPE COGS from recipe_ingredients
- [ ] Implement AC4: PRODUCT with multiple recipe_ingredients COGS aggregation
- [ ] Run full test suite: `test:unit:costing` and `test:integration:inventory`
- [ ] Code review with no P0/P1 blockers

---

## Files to Create

| File | Description |
|------|-------------|
| `packages/modules/inventory/src/test-fixtures/inventory-item-fixtures.ts` | Canonical fixtures for inventory items (PRODUCT, INGREDIENT, SERVICE, RECIPE) |
| `packages/modules/inventory/src/test-fixtures/recipe-fixtures.ts` | Canonical fixtures for recipe compositions (BOM) |
| `packages/modules/inventory/src/test-fixtures/index.ts` | Re-exports for all inventory test fixtures |

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/inventory/src/index.ts` | Modify | Export new test fixtures |
| `apps/api/__test__/integration/inventory/item-recipe-correctness.test.ts` | Create | Integration tests for AC1–AC4 (real DB) |
| `packages/modules/inventory-costing/__test__/unit/recipe-cogs.test.ts` | Create | Unit tests for recipe COGS calculation |

---

## Estimated Effort

3 days (fixtures + stock tracking logic + recipe BOM + COGS aggregation)

## Risk Level

Medium (P1 — base story for Epic 58; no dependencies; moderate complexity)

---

## Dev Notes

- **Item type enforcement:** Item type is set at creation/update time. Stock tracking logic MUST check `item.type` before updating `item_stock`.
- **Recipe BOM:** `recipe_ingredients` table links PRODUCT/RECIPE to its ingredient components. Each entry has `quantity` and `unit`. COGS calculation multiplies each ingredient's cost by quantity.
- **Costing method resolution:** Costing method is per-company setting (`settings_strings` with key `costing_method` or company-level default). Resolve at company level for COGS calculation.
- **Standard costing:** Standard costing stores `standard_cost` per item. When actual purchase price differs, variance is recorded separately. The core FIFO/Average/LIFO layer consumption still applies — only the variance overlay is Standard-specific.
- **No stock for SERVICE/RECIPE:** `item_stock` table has no entries for SERVICE or RECIPE items. Queries for stock levels MUST filter by item type or join to exclude these types.

---

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events: stock movement events for PRODUCTS and INGREDIENTS
- [ ] Audit fields: `company_id`, `outlet_id`, `item_id`, `quantity`, `movement_type`
- [ ] Audit tier: `OPERATIONAL`

### Idempotency
- [ ] Idempotency key field: `client_tx_id` (stock movement unique identifier)
- [ ] Duplicate handling: `return DUPLICATE` for exact duplicate movement

### Validation Rules
- [ ] `company_id` must match authenticated company
- [ ] `outlet_id` must be valid for company
- [ ] `item_id` must be PRODUCT or INGREDIENT for stock movement
- [ ] `quantity` must be positive integer

### Error Handling
- [ ] Retryable errors: network failures during stock update
- [ ] Non-retryable errors: invalid item type, insufficient stock (for reduction)
- [ ] Error response format: `{ success: false, error_code: string, message: string }`

---

## Dependencies

- None (Epic 58 base story)

---

## Technical Debt Review

- [ ] No shortcuts taken that require follow-up
- [ ] No `TODO`/`FIXME` comments left in production code
- [ ] No `as any` casts added without justification
- [ ] No deprecated functions used
- [ ] Integration tests included (not deferred)
- [ ] All new debt items added to registry

---

## Notes

**Why item types matter:** The distinction between PRODUCTS/INGREDIENTS (stock-tracked) and SERVICE/RECIPE (not stock-tracked) is fundamental to inventory correctness. A bug allowing SERVICE items to accumulate stock would corrupt inventory valuation.

**Recipe vs. PRODUCT:** A RECIPE is a menu item that defines ingredients but is not itself stock-tracked. A PRODUCT is a menu item that IS stock-tracked and may have a recipe (BOM). The recipe provides COGS calculation; the product provides stock tracking.

**Standard costing note:** Standard costing correctness requires validating that price variances are captured and reported correctly when actual purchase price differs from standard cost. COGS itself is still calculated using the underlying FIFO/Average/LIFO method. This is validated in Story 58.3.

_Last Updated: 2026-05-07_
