# Story 62.2: Inventory & COGS Projection Accuracy

**Status:** ready-for-dev

> **Sprint-Status Append-Only Rule (E45-A1 / E46-A1) — MANDATORY:**
> - **REQUIRED**: `npx tsx scripts/update-sprint-status.ts --epic 62 --story 62-2 --title inventory-cogs-projection-accuracy --status done`
> - **NEVER** replace entire `sprint-status.yaml`

---

## Story

As a **financial auditor**,
I want **inventory valuation and COGS projections to match source-of-truth item cost and stock data with zero variance**,
so that **inventory-related financial reporting is provably accurate**.

## Context

- **Source:** Epic 62 (FR1, FR4) — Projection Correctness Hardening
- **Predecessor:** Story 62.1 (AR/AP/GL projection accuracy) + Epic 58 (inventory posting gate evidence)
- **Scope:** `packages/modules/inventory-costing`, `packages/modules/reporting`, `apps/api/src/routes/reports.ts`
- **Risk:** P0 — inventory valuation errors corrupt balance sheet and COGS reporting

## Acceptance Criteria

**AC1: Inventory valuation projection matches source-of-truth cost layers**
**Given** a company with inventory items having cost layers (`inventory_cost_layers`),
**When** the inventory valuation projection (`getAllItemsCostSummary`) is called,
**Then** `totalCost` matches `SUM(remaining_qty * unit_cost)` from `inventory_cost_layers` WHERE `remaining_qty > 0`,
**And** `variance == 0` in `__EPIC62_GATE__` JSON evidence.

**AC2: COGS projection matches source-of-truth journal entries**
**Given** a company with posted COGS journal batches (`doc_type = 'COGS'`),
**When** COGS journal totals are queried from `journal_batches` + `journal_lines`,
**Then** `SUM(debit)` from COGS journal lines equals `totalCogs` from `postCogsForSale` output,
**And** `variance == 0` in `__EPIC62_GATE__` JSON evidence.

**AC3: Deterministic projection outputs**
**Given** stable source data (no concurrent writes),
**When** any inventory projection is called twice with identical parameters,
**Then** both responses return identical numeric outputs.

**AC4: `__EPIC62_GATE__` evidence emitted**
**When** each reconciliation test verifies variance == 0,
**Then** the test emits `__EPIC62_GATE__` JSON lines to stdout.

## Tasks / Subtasks

- [ ] Task 1: Inventory valuation reconciliation test (AC: 1, 3, 4)
  - [ ] 1.1 Create `apps/api/__test__/integration/reporting/inventory-valuation-projection-reconciliation.test.ts`
  - [ ] 1.2 Implement zero-state test: variance == 0 with no items
  - [ ] 1.3 Implement seeded data test: items + cost layers → `getAllItemsCostSummary` matches raw SQL
  - [ ] 1.4 Emit `__EPIC62_GATE__` JSON evidence
  - [ ] 1.5 Verify deterministic output across repeated calls
- [ ] Task 2: COGS projection reconciliation test (AC: 2, 3, 4)
  - [ ] 2.1 Create `apps/api/__test__/integration/reporting/cogs-projection-reconciliation.test.ts`
  - [ ] 2.2 Post COGS via `postCogsForSale` with known item costs
  - [ ] 2.3 Verify journal batch total matches posting result
  - [ ] 2.4 Emit `__EPIC62_GATE__` JSON evidence
  - [ ] 2.5 Verify deterministic output

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/__test__/integration/reporting/inventory-valuation-projection-reconciliation.test.ts` | Inventory valuation vs cost layers |
| `apps/api/__test__/integration/reporting/cogs-projection-reconciliation.test.ts` | COGS projection vs journal entries |

## Estimated Effort

2 days

## Risk Level

P0 — Inventory and COGS are balance sheet + P&L line items. Material variance corrupts financial statements.

## Dev Notes

### Pre-existing code to leverage

- `packages/modules/inventory-costing/src/index.ts` — `getAllItemsCostSummary()`, `createCostLayer()`
- `packages/modules/accounting/src/posting/cogs.ts` — `postCogsForSale()`
- `apps/api/__test__/integration/inventory/inventory-posting.test.ts` — GATE2/NFR2 pattern (isolated company, COGS accounts, account mappings)
- `apps/api/__test__/integration/accounting/ar-subledger-reconciliation.test.ts` — `__EPIC62_GATE__` evidence pattern

### Inventory valuation — source-of-truth query

```sql
SELECT CAST(SUM(remaining_qty) AS DECIMAL(18,4)) AS total_quantity,
       CAST(SUM(remaining_qty * unit_cost) AS DECIMAL(18,4)) AS total_cost
FROM inventory_cost_layers
WHERE company_id = :companyId AND remaining_qty > 0
```

### COGS — source-of-truth query

```sql
SELECT CAST(SUM(jl.debit) AS DECIMAL(18,4)) AS total_cogs
FROM journal_lines jl
INNER JOIN journal_batches jb ON jb.id = jl.journal_batch_id
WHERE jb.company_id = :companyId AND jb.doc_type = 'COGS'
```

### Isolated company fixture pattern

```typescript
const company = await createTestCompanyMinimal();
const outlet = await createTestOutlet(company.id);
const user = await createTestUser(company.id);
// Create COGS + inventory asset accounts + account_mappings
// Post COGS via postCogsForSale
// Compare subledger vs journal
```

## Dependencies

- Story 62.1 (AR/AP/GL) — establishes `__EPIC62_GATE__` pattern and test directory
- Epic 58 gate evidence (inventory-posting.test.ts) — established COGS posting + reconciliation pattern
- `@jurnapod/modules-inventory-costing` — `getAllItemsCostSummary`
- `@jurnapod/modules-accounting/posting/cogs` — `postCogsForSale`

---

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
