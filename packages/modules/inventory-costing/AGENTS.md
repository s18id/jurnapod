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

### Settings Access

This package accesses company settings via `SettingsPort` from `@jurnapod/modules-platform/settings`.

**Key settings used:**
- `inventory.costing_method` — AVG, FIFO, LIFO (default: AVG)
- Legacy fallback: `inventory_costing_method`

**Usage:**

```typescript
import { createSettingsPort } from '@jurnapod/modules-platform/settings';

const settings = createSettingsPort(db);

const method = await settings.resolve<CostingMethod>(
  companyId,
  'inventory.costing_method',
  { defaultValue: 'AVG' }
);
```

**Migration note:**
Previously this package directly queried `company_settings`. It now uses SettingsPort with dual-read (typed tables + legacy fallback).

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

## Database Testing Policy (MANDATORY)

**NO MOCK DB for DB-backed business logic tests.** Use real DB via `.env`.

Any DB mock found in DB-backed tests is a P0 risk and must be treated as a blocker.

Mocking database interactions for code that reads/writes SQL tables creates a **false sense of security** and introduces **severe production risk**:

- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks hide transaction isolation issues that only manifest under real concurrency
- Mocks mask performance problems that only appear with real data volumes
- Integration tests with real DB catch these issues early, before production

**What may still be mocked:**
- External HTTP services
- Message queues
- File system operations
- Time (use `vi.useFakeTimers()`)

**Non-DB logic** (pure computation) may use unit tests without database.

For project-wide conventions, see root `AGENTS.md`.

- `@jurnapod/db` — Database connectivity
- `@jurnapod/shared` — Shared schemas
- `@jurnapod/modules-inventory` — Stock movements trigger costing
- `@jurnapod/modules-accounting` — Posts cost journal entries

## Database Testing Policy (MANDATORY)

**NO MOCK DB for DB-backed business logic tests.** Use real DB via `.env`.

Mocking database interactions for code that reads/writes SQL tables creates a **false sense of security** and introduces **severe production risk**:

- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks hide transaction isolation issues that only manifest under real concurrency
- Mocks mask performance problems that only appear with real data volumes
- Integration tests with real DB catch these issues early, before production

**What may still be mocked:**
- External HTTP services
- Message queues
- File system operations
- Time (use `vi.useFakeTimers()`)

**Non-DB logic** (pure computation) may use unit tests without database.

For project-wide conventions, see root `AGENTS.md`.