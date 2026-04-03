# @jurnapod/modules-inventory-costing

Inventory costing engine for Jurnapod ERP — supports FIFO, moving average, and standard cost methods.

## Overview

The `@jurnapod/modules-inventory-costing` package provides:

- **FIFO costing** — First-in, first-out cost calculation
- **Moving average** — Weighted average cost per unit
- **Standard cost** — Predefined costs with variance tracking
- **Cost layer tracking** — Maintain cost layers for each item

## Installation

```bash
npm install @jurnapod/modules-inventory-costing
```

## Usage

### Cost Calculation Methods

```typescript
import { 
  calculateFIFOCost,
  calculateMovingAverageCost,
  calculateStandardCost 
} from '@jurnapod/modules-inventory-costing';

// FIFO: Consume oldest layers first
const fifoResult = await calculateFIFOCost(db, {
  companyId: 1,
  itemId: 5,
  quantity: 10
});

// Moving Average: Weighted average of all layers
const avgResult = await calculateMovingAverageCost(db, {
  companyId: 1,
  itemId: 5,
  quantity: 10
});

// Standard Cost: Fixed cost with variance
const stdResult = await calculateStandardCost(db, {
  companyId: 1,
  itemId: 5,
  quantity: 10
});
```

### Cost Result Structure

```typescript
interface CostResult {
  unitCost: number;        // Cost per unit (in cents)
  totalCost: number;       // Total cost (in cents)
  layersUsed: CostLayer[]; // Layers consumed
  variance?: number;       // Variance from standard (if applicable)
}
```

## Cost Methods

### FIFO (First-In, First-Out)
- Assumes oldest inventory is sold first
- Good for perishable goods
- Updates with each purchase

### Moving Average
- Weighted average of all available stock
- Smoother cost fluctuations
- Updates with each purchase

### Standard Cost
- Predefined expected cost
- Variances tracked separately
- Used for budgeting and control

## Architecture

```
packages/modules-inventory-costing/
├── src/
│   ├── index.ts                    # Main exports
│   └── types/
│       └── costing.ts              # Cost types and interfaces
```

## Related Packages

- [@jurnapod/modules-inventory](../inventory) - Stock movements
- [@jurnapod/modules-accounting](../accounting) - Cost journal posting
- [@jurnapod/db](../../packages/db) - Database connectivity
- [@jurnapod/shared](../../packages/shared) - Shared schemas