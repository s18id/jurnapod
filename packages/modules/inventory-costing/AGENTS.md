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

## DB Testing Policy

**NO MOCK DB for DB-backed business logic tests.** Use real DB integration via `.env`.

DB-backed tests (tests that exercise database queries, transactions, or constraints) MUST use real database connections:

```typescript
// Load .env before other imports
import path from 'path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env') });

import { createKysely, type KyselySchema } from '@jurnapod/db';

const db = createKysely({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// CRITICAL: Clean up in afterAll
afterAll(async () => {
  await db.destroy();
});
```

**Why no mocks for DB-backed tests?**
- Mocks don't catch SQL syntax errors, schema mismatches, or constraint violations
- Mocks don't reveal transaction isolation issues
- Integration with real DB catches performance problems early

**What to mock instead:**
- External HTTP services
- Message queues
- File system operations
- Time (use `vi.useFakeTimers()`)

**Non-DB logic (pure computation) may use unit tests without database.**

---

## Related Packages

- `@jurnapod/db` — Database connectivity
- `@jurnapod/shared` — Shared schemas
- `@jurnapod/modules-inventory` — Stock movements trigger costing
- `@jurnapod/modules-accounting` — Posts cost journal entries

For project-wide conventions, see root `AGENTS.md`.