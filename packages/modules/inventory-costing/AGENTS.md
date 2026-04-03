# AGENTS.md — @jurnapod/modules-inventory-costing

## Package Purpose

Inventory costing engine for Jurnapod ERP — supports FIFO, moving average, and standard cost methods.

**Core Capabilities:**
- **FIFO costing**: First-in, first-out cost calculation
- **Moving average**: Weighted average cost per unit
- **Standard cost**: Predefined standard costs with variance tracking
- **Cost layer tracking**: Maintain cost layers for each inventory item

**Boundaries:**
- ✅ In: Cost calculation methods, cost layer management, variance computation
- ❌ Out: Stock movements (in modules-inventory), journal posting (in modules-accounting)

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint code |

---

## Architecture Patterns

### Cost Calculator Interface

```typescript
import type { CostCalculator, CostLayer, CostResult } from './types/costing.js';

// FIFO calculator
const fifo: CostCalculator = {
  calculateCost(layers: CostLayer[], quantity: number): CostResult {
    // Consume oldest layers first
  }
};

// Moving average calculator
const movingAvg: CostCalculator = {
  calculateCost(layers: CostLayer[], quantity: number): CostResult {
    // Weighted average of all layers
  }
};
```

### Cost Calculation

```typescript
import { calculateMovingAverageCost } from '@jurnapod/modules-inventory-costing';

const result = await calculateMovingAverageCost(
  db,
  { companyId: 1, itemId: 5 },
  { quantity: 10 }
);
// Returns: { unitCost: 2500, totalCost: 25000, layersUsed: [...] }
```

---

## Module Organization

| Module | File | Purpose |
|--------|------|---------|
| Types | `types/costing.ts` | Cost layer and result types |
| Index | `index.ts` | Main exports |

### File Structure

```
packages/modules/inventory-costing/
├── src/
│   ├── index.ts                    # Main exports
│   └── types/
│       └── costing.ts              # Cost types and interfaces
│
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md (this file)
```

---

## Review Checklist

When modifying this package:

- [ ] Cost calculations are mathematically correct
- [ ] All cost methods (FIFO, moving avg, standard) produce consistent results
- [ ] Variance tracking is implemented for standard cost
- [ ] No floating-point math for money calculations
- [ ] Cost layers are properly ordered and consumed

---

## Related Packages

- `@jurnapod/db` — Database connectivity
- `@jurnapod/shared` — Shared schemas
- `@jurnapod/modules-inventory` — Stock movements trigger costing
- `@jurnapod/modules-accounting` — Posts cost journal entries

For project-wide conventions, see root `AGENTS.md`.