# Story 58.2: Stock Movement & Outlet Scoping Correctness

**Status:** planned

> ⚠️ **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> If this story modifies `_bmad-output/implementation-artifacts/sprint-status.yaml`:
> - **REQUIRED**: Run `npx tsx scripts/update-sprint-status.ts --epic 58 --story 58-2 --status done` (the canonical utility)
> - **REQUIRED**: After editing, run `npx tsx scripts/validate-sprint-status.ts` to confirm file integrity
> - **NEVER** replace the entire file — always append only
> - **Retrospective workflow will check this before closing the epic** (E46-A4)

---

## Story

As a **multi-outlet operations manager**,  
I want **stock movements to be correctly scoped by outlet and company**,  
So that **inventory reports show accurate quantities per outlet and cross-outlet leakage cannot occur**.

---

## Context

**Source:** Epic 58 kickoff; Sprint 58 baseline

**Background:** Story 58.1 establishes item type taxonomy and recipe composition. Story 58.2 extends this to prove stock movements are correctly scoped by `company_id AND outlet_id` (composite constraint), and that negative stock transactions are rejected atomically.

**Key facts:**
- Stock movements must be scoped by `company_id AND outlet_id` — never outlet alone
- Transfers between outlets must be atomic (debit one, credit another in same transaction)
- Negative stock (oversell, shrinkage beyond available) must be rejected
- Multi-item transactions with any negative-stock line must be rejected atomically
- Outlet-specific pricing resolved from `item_prices` filtered by `outlet_id`

**Predecessor:** Story 58.1 complete; Epic 57 Story 57.2 complete

**Epic 57 dependency note:** From Story 58.2 onward, Epic 57 Story 57.2 MUST be complete. Verify before proceeding.

---

## Test Scenario Review Checkpoint (MANDATORY — E54-A1)

### Pre-Implementation Checklist

- [ ] **Happy paths identified:**
  1. Stock movement scoped by `company_id AND outlet_id` — correct isolation
  2. Stock query returns only outlet-specific quantities
  3. Transfer from outlet A to outlet B: A decreases, B increases atomically
  4. Outlet-specific pricing: fallback from outlet price to company price
- [ ] **Error paths identified:**
  1. Negative stock rejection: movement that would reduce stock below zero
  2. Multi-item atomic rejection: any line causes negative, entire tx rejected
  3. Cross-outlet leakage prevention: movement for wrong company rejected
- [ ] **Edge cases identified:**
  1. Transfer to same outlet: should be no-op or rejected
  2. Zero quantity movement: should be no-op
  3. Company-level price when no outlet-specific price exists
  4. Outlet without specific prices: all items fall back to company-level
- [ ] **Test fixture needs identified:** Multi-outlet company fixture, stock movement fixtures with outlet scoping
- [ ] **Integration test scope:** All tests for outlet scoping need real DB
- [ ] **Negative auth test role:** Use `CASHIER` or dedicated test role (NOT `OWNER`/`SUPER_ADMIN`) for scoping tests

### Review Outcome

| Scenario | Type | Coverage Plan |
|----------|------|--------------|
| Stock movement scoped by company_id AND outlet_id | Happy | Integration |
| Stock query filtered by outlet_id | Happy | Integration |
| Transfer A→B: A decreases, B increases atomically | Happy | Integration |
| Outlet-specific price resolved (fallback to company) | Happy | Integration |
| Negative stock rejected with INSUFFICIENT_STOCK | Error | Integration |
| Multi-item tx with negative line rejected atomically | Error | Integration |
| Cross-company leakage prevented | Error | Integration |
| Transfer to same outlet: no-op | Edge | Integration |

**Sign-off:** Test scenarios reviewed and approved before implementation begins.

---

## Acceptance Criteria

**AC1: Stock movements scoped by composite constraint**
**Given** a stock movement transaction (sale, adjustment, transfer),
**When** the movement is recorded,
**Then** the movement MUST be scoped by `company_id` AND `outlet_id` (composite constraint).

**AC2: Stock queries filtered by outlet_id**
**Given** stock movement records,
**When** querying stock levels,
**Then** the query MUST filter by `outlet_id` and return only outlet-specific quantities.

**AC3: Atomic transfer between outlets**
**Given** a transfer from outlet A to outlet B,
**When** the movement is recorded,
**Then** outlet A's stock decreases and outlet B's stock increases atomically.

**AC4: Outlet-specific pricing fallback**
**Given** outlet-specific pricing in `item_prices`,
**When** a sale is processed at outlet X,
**Then** the price MUST be resolved from `item_prices` filtered by `outlet_id = X` (fallback to company-level if no outlet-specific price exists).

**AC5: Negative stock rejection**
**Given** a stock movement that would reduce quantity below zero,
**When** the movement is recorded,
**Then** the system MUST reject with error code `INSUFFICIENT_STOCK` and a message containing the shortfall quantity; no change to stock levels.

**AC6: Multi-item atomic rejection**
**Given** a multi-item transaction where one or more lines would cause negative stock,
**When** the transaction is processed,
**Then** the system MUST reject the entire transaction atomically — no partial stock updates, no partial journal entries.

---

## Test Coverage Criteria

- [ ] Coverage target: all stock movement paths + outlet scoping
- [ ] Happy paths to test:
  - [ ] Sale at outlet X: stock decreases for outlet X only
  - [ ] Adjustment at outlet X: stock adjusted for outlet X only
  - [ ] Transfer A→B: A decreases, B increases (atomic)
  - [ ] Outlet price used when available
  - [ ] Company price fallback when no outlet price
- [ ] Error paths to test:
  - [ ] 400: `INSUFFICIENT_STOCK` when movement would go negative
  - [ ] 409: multi-item rejection when any line causes negative
  - [ ] 403: cross-company movement prevented
- [ ] Edge cases to test:
  - [ ] Transfer to same outlet: no-op or 400
  - [ ] Zero quantity: no-op

---

## Test Fixtures

### Pre-Implementation Checklist
- [ ] New patterns identified: multi-outlet stock movement, outlet-specific pricing
- [ ] Existing canonical fixtures reviewed: `createTestOutletMinimal`, `createTestItem`
- [ ] Fixture location: `packages/modules/inventory/src/test-fixtures/` (owner package)

### Fixture Creation/Update
- [ ] **New fixtures needed:**
  - [ ] `createTestOutletWithStock(companyId, itemId, initialQty)` — outlet with stock for specific item
  - [ ] `createTestOutletPricing(outletId, itemId, price)` — outlet-specific price
  - [ ] `createTestTransferMovement(fromOutletId, toOutletId, itemId, qty)` — atomic transfer fixture
- [ ] **Existing fixtures to update:**
  - [ ] `createTestOutletMinimal` — ensure outlet has `timezone` field for costing resolution

---

## Tasks / Subtasks

- [ ] Verify Epic 57 Story 57.2 is complete before starting (concurrency rule)
- [ ] Create multi-outlet stock movement fixtures
- [ ] Create outlet-specific pricing fixtures
- [ ] Implement AC1: composite `company_id AND outlet_id` scoping on all stock queries
- [ ] Implement AC2: `outlet_id` filter on stock level queries
- [ ] Implement AC3: atomic transfer (single transaction for both movements)
- [ ] Implement AC4: outlet-specific price resolution with fallback
- [ ] Implement AC5: negative stock rejection with `INSUFFICIENT_STOCK` error code
- [ ] Implement AC6: multi-item atomic rejection (transaction rollback)
- [ ] Run `test:integration:inventory` and `test:integration:inventory:posting`
- [ ] Code review with no P0/P1 blockers

---

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/__test__/integration/inventory/stock-movement-outlet-scoping.test.ts` | Integration tests for outlet scoping + negative stock rejection |
| `packages/modules/inventory/src/test-fixtures/stock-movement-fixtures.ts` | Fixtures for stock movements with outlet scoping |

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/modules/inventory/src/services/stock-movement.ts` | Modify | Add `outlet_id` scoping on all queries |
| `packages/modules/inventory/src/services/pricing.ts` | Modify | Add outlet-specific price resolution |
| `packages/modules/inventory/src/services/transfer.ts` | Modify | Make transfer atomic (single transaction) |
| `packages/modules/inventory/src/services/negative-stock-guard.ts` | Create | Reject movements that would cause negative stock |

---

## Estimated Effort

3 days (outlet scoping + atomic transfer + negative stock guard + pricing fallback)

## Risk Level

High (P1 — blocking for 58.3 and 58.4; Epic 57 dependency; cross-outlet correctness critical)

---

## Dev Notes

- **Composite constraint:** Every stock query MUST include both `company_id` and `outlet_id`. Never filter by `outlet_id` alone — company isolation is mandatory.
- **Atomic transfer:** Use `newKyselyConnection()` or `withKysely()` with explicit transaction. Outgoing movement and incoming movement must be in same DB transaction.
- **Negative stock guard:** Check available quantity (`remaining_qty`) BEFORE applying movement. If `remaining_qty - movement_qty < 0`, reject with `INSUFFICIENT_STOCK`.
- **Multi-item atomicity:** All items in a transaction must be validated for available stock BEFORE any movement is applied. Use a single transaction with pre-check validation.
- **Pricing fallback:** `item_prices` filtered by `outlet_id` first; if no rows, fall back to `item_prices` with `outlet_id IS NULL` (company-level).

---

## Cross-Cutting Concerns

### Audit Integration
- [ ] Audit events: stock movement events (sale, adjustment, transfer)
- [ ] Audit fields: `company_id`, `outlet_id`, `from_outlet_id`, `to_outlet_id`, `item_id`, `quantity`, `movement_type`, `reason`
- [ ] Audit tier: `OPERATIONAL`

### Idempotency
- [ ] Idempotency key field: `client_tx_id` (unique per movement)
- [ ] Duplicate handling: `return DUPLICATE` for exact duplicate movement

### Validation Rules
- [ ] `company_id` must match authenticated company
- [ ] `outlet_id` must be valid for company
- [ ] `item_id` must be PRODUCT or INGREDIENT
- [ ] `quantity` must be positive integer for additions; negative for reductions
- [ ] `from_outlet_id` and `to_outlet_id` must be different (transfers)

### Error Handling
- [ ] Retryable errors: network failures, deadlocks
- [ ] Non-retryable errors: `INSUFFICIENT_STOCK`, invalid outlet, cross-company attempt
  - [ ] Error codes: `INSUFFICIENT_STOCK` (the canonical error code for negative-stock rejection; all references MUST use `INSUFFICIENT_STOCK` — no aliases or variants)

---

## Dependencies

- Story 58.1 complete
- Epic 57 Story 57.2 complete (concurrency rule: 58.2+ blocked until 57.2 done)

---

## Shared Contract Changes (MANDATORY)

> Applies when: story modifies shared constants, types, or contracts consumed by other packages/tests.

### Blast Radius Check (E33-A1)
Before marking complete, verify the change doesn't break consumers:

- [ ] Grep for all usages of `item_stock` table in other packages
- [ ] Grep for all usages of stock movement service functions
- [ ] Run consuming package tests — all must pass

### Consumer Audit Results

| Consumer File | Tested | Result |
|--------------|---------|--------|
| `packages/modules/inventory-costing/src/...` | N/A | TBD |
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

**Why atomicity matters:** If a transfer from outlet A to outlet B fails after debiting A but before crediting B, stock is lost. Atomic transactions prevent this.

**Why composite scoping matters:** Filtering by `outlet_id` alone could return data from another company that happens to share the same outlet ID. `company_id` isolation is mandatory.

**INSUFFICIENT_STOCK error:** Must include the shortfall quantity in the error message so the caller knows how much additional stock is needed. Example: "Insufficient stock: available=10, requested=15, shortfall=5".

_Last Updated: 2026-05-07_
