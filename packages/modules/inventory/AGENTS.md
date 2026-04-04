# AGENTS.md — @jurnapod/modules-inventory

## Package Purpose

Inventory management for Jurnapod ERP — items, variants, stock movements, recipes, BOM, and supplies tracking.

**Core Capabilities:**
- **Item management**: Items with variants, prices, groups
- **Stock tracking**: Stock movements, quantities, locations
- **Recipe management**: Recipe/BOM definitions with ingredients
- **Supplies tracking**: Ingredient and raw material management
- **Variant pricing**: Multiple variants per item with different prices

**Boundaries:**
- ✅ In: Item CRUD, stock movements, recipe definitions, supplies tracking
- ❌ Out: Cost calculation (modules-inventory-costing), journal posting (modules-accounting)

---

## Quick Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to dist/ |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Lint code |

---

## Architecture Patterns

### Item with Variants

```typescript
import { ItemService, ItemVariantService } from '@jurnapod/modules-inventory';

const itemService = new ItemService(db);

// Create item with variants
const item = await itemService.createItem({
  companyId: 1,
  name: 'Latte',
  code: 'LAT001',
  type: 'PRODUCT',
  variants: [
    { name: 'Regular', code: 'LAT-R', price: 25000 },
    { name: 'Large', code: 'LAT-L', price: 30000 }
  ]
});
```

### Stock Movements

```typescript
import { StockService } from '@jurnapod/modules-inventory';

const stockService = new StockService(db);

// Record stock movement
await stockService.recordMovement({
  companyId: 1,
  itemId: 5,
  variantId: 10,
  outletId: 1,
  type: 'SALE',          // SALE, PURCHASE, ADJUSTMENT, etc.
  quantity: -1,          // Negative for outgoing
  reference: 'TRX-123',
  reason: 'Sold to customer'
});
```

### Recipe Definition

```typescript
import { RecipeService } from '@jurnapod/modules-inventory';

const recipeService = new RecipeService(db);

// Define recipe (BOM)
await recipeService.createRecipe({
  companyId: 1,
  itemId: finishedGoodId,
  ingredients: [
    { itemId: coffeeBeanId, quantity: 20, unit: 'g' },
    { itemId: milkId, quantity: 100, unit: 'ml' }
  ],
  yieldQuantity: 1,
  yieldUnit: 'cup'
});
```

---

## Module Organization

| Service | File | Purpose |
|---------|------|---------|
| ItemService | `services/item-service.ts` | Item CRUD |
| ItemVariantService | `services/item-variant-service.ts` | Variant management |
| ItemGroupService | `services/item-group-service.ts` | Item grouping |
| ItemPriceService | `services/item-price-service.ts` | Price management |
| StockService | `services/stock-service.ts` | Stock movements |
| RecipeService | `services/recipe-service.ts` | Recipe/BOM management |
| SuppliesService | `services/supplies-service.ts` | Raw materials |

### File Structure

```
packages/modules/inventory/
├── src/
│   ├── index.ts                    # Main exports
│   ├── db.ts                       # Database helpers
│   ├── errors.ts                   # Error classes
│   │
│   ├── services/
│   │   ├── index.ts
│   │   ├── item-service.ts         # Item CRUD
│   │   ├── item-variant-service.ts # Variant management
│   │   ├── item-group-service.ts   # Item groups
│   │   ├── item-price-service.ts   # Pricing
│   │   ├── stock-service.ts        # Stock movements
│   │   ├── recipe-service.ts       # Recipe/BOM
│   │   └── supplies-service.ts     # Raw materials
│   │
│   └── interfaces/
│       ├── index.ts
│       ├── item-service.ts
│       ├── item-variant-service.ts
│       ├── item-group-service.ts
│       ├── item-price-service.ts
│       ├── stock-service.ts
│       ├── recipe-service.ts
│       ├── supplies-service.ts
│       └── shared.ts
│
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md (this file)
```

---

## Coding Standards

### TypeScript Conventions

1. **Use `.js` extensions in imports** (ESM compliance)
2. **Export services from `index.ts`** for public API
3. **Use Kysely query builder** — never raw SQL

### Stock Movement Rules

1. **Every movement affects stock** — positive or negative quantity
2. **Stock must never go negative** — validate before commit
3. **Reference is required** — links to transaction, adjustment, etc.

---

## Review Checklist

When modifying this package:

- [ ] Stock movements are balanced (in = out over time)
- [ ] No negative stock allowed
- [ ] Variant prices properly inherited or overridden
- [ ] Recipe yield calculations are accurate
- [ ] Item type transitions validated (PRODUCT ↔ SERVICE)
- [ ] Kysely query builder used (not raw SQL)
- [ ] Company/outlet scoping on all queries

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
- `@jurnapod/modules-inventory-costing` — Cost calculation
- `@jurnapod/modules-accounting` — Posts inventory journals

For project-wide conventions, see root `AGENTS.md`.