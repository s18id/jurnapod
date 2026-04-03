# ADR-0015: Inventory / Costing / Accounting Package Boundary

## Status

Accepted

## Context

Epic 24 extracted cost-tracking logic into a new `@jurnapod/modules-inventory-costing` package. This created a three-way boundary between:

- **`modules-inventory`**: Stock management, stock transactions, stock levels
- **`modules-inventory-costing`**: Cost layer management, cost calculation (AVG/FIFO/LIFO), COGS-aware deduction contract
- **`modules-accounting`**: Journal posting, account mappings, COGS journal entry creation

This ADR documents the boundaries and responsibilities of each package to prevent circular dependencies and clarify the dependency direction.

## Decision

### Package Responsibilities

| Package | Responsibilities |
|---------|-----------------|
| `modules-inventory` | Stock levels, variant stock tracking, stock transactions (INCREASE/DECREASE/SET), stock reservation |
| `modules-inventory-costing` | Cost layers (acquire/consume), weighted average cost, FIFO/LIFO consumption, cost summary tracking |
| `modules-accounting` | Chart of accounts, journal entries, posting rules, COGS posting during sale fulfillment |

### Dependency Direction (One-Way)

```
modules-inventory    →  modules-inventory-costing
                         (for cost-aware stock deduction)

modules-accounting   →  modules-inventory-costing
                         (for COGS cost calculation during posting)
```

**Important:** `modules-inventory` and `modules-accounting` must NOT depend on each other directly. All financial cost flow goes through `modules-inventory-costing`.

### The `deductWithCost` Contract

The primary integration point between inventory and accounting is the `deductWithCost()` function in `modules-inventory-costing`:

```typescript
// Signature
async function deductWithCost(
  companyId: number,
  items: Array<{ itemId: number; qty: number; stockTxId: number }>,
  db: KyselySchema
): Promise<DeductionResult>
```

This function:
1. Calculates costs for each item using the configured costing method (AVG/FIFO/LIFO)
2. Deducts from cost layers atomically
3. Returns stock transaction IDs and item cost breakdown for COGS posting

### COGS Posting Flow (Accounting ← Costing)

When a sale occurs, the posting flow is:

```
1. modules-sales creates sales invoice
2. modules-accounting calls modules-inventory-costing.deductWithCost()
   → Returns: { stockTxIds, itemCosts[] }
3. modules-accounting creates COGS journal entries using itemCosts
```

### Cost Layer Acquisition Flow (Inventory → Costing)

When inventory is acquired (purchase order receipt, stock adjustment increase):

```
1. modules-inventory records stock transaction
2. modules-inventory calls modules-inventory-costing.createCostLayer()
   → Creates cost layer in inventory_cost_layers table
   → Updates inventory_item_costs summary
```

### What Each Package Must NOT Do

| Package | Must NOT |
|---------|----------|
| `modules-inventory` | Calculate COGS, create journal entries, know about account mappings |
| `modules-inventory-costing` | Create journal entries, know about GL accounts, manage stock transactions |
| `modules-accounting` | Read/write cost layers directly, manage stock levels |

### Database Tables

| Table | Owner Package |
|-------|---------------|
| `inventory_cost_layers` | modules-inventory-costing |
| `cost_layer_consumption` | modules-inventory-costing |
| `inventory_item_costs` | modules-inventory-costing |
| `inventory_transactions` | modules-inventory |
| `inventory_stocks` | modules-inventory |

Note: `inventory_transactions` has a foreign key relationship used by `modules-inventory-costing` to record cost layer consumption, but the cost layer tables themselves are owned by `modules-inventory-costing`.

## Consequences

### Positive

- Clear separation of concerns between stock management and cost/financial tracking
- Cost calculation logic reusable by both inventory operations and accounting posting
- Easier to test cost logic in isolation
- Single place to change costing methods (AVG/FIFO/LIFO)
- Avoids circular dependency between inventory and accounting

### Negative / Costs

- Cross-package transactions must be carefully orchestrated
- Costing method configuration lives in `modules-inventory-costing` but is set via company settings (owned by `modules-platform`)
- Need to maintain backward compatibility when changing the `deductWithCost` contract

## References

- Epic 24: Inventory Costing Boundary Extraction
- Story 24.1: Create inventory-costing package scaffold
- Story 24.2: Extract cost tracking to costing package
- ADR-0014: Package Boundary Policy for API Detachment
