# @jurnapod/modules-inventory

Inventory management for Jurnapod ERP — items, variants, stock movements, recipes, and supplies.

## Overview

The `@jurnapod/modules-inventory` package provides:

- **Item management** — Items with variants, prices, groups, and categories
- **Stock tracking** — Stock movements, quantities, and locations
- **Recipe management** — Recipe/Bill of Materials definitions
- **Variant pricing** — Multiple variants per item with different prices
- **Supplies tracking** — Raw materials and ingredients

## Installation

```bash
npm install @jurnapod/modules-inventory
```

## Usage

### Items

```typescript
import { ItemService } from '@jurnapod/modules-inventory';

const itemService = new ItemService(db);

// Create item
const item = await itemService.createItem({
  companyId: 1,
  name: 'Latte',
  code: 'LAT001',
  type: 'PRODUCT',
  trackStock: true,
  groupId: coffeeGroupId
});

// Get item with variants
const fullItem = await itemService.getItemWithVariants(1, item.id);
```

### Stock Movements

```typescript
import { StockService } from '@jurnapod/modules-inventory';

const stockService = new StockService(db);

// Record a sale (decreases stock)
await stockService.recordMovement({
  companyId: 1,
  itemId: 5,
  variantId: 10,
  outletId: 1,
  type: 'SALE',
  quantity: -1,
  reference: 'TRX-123'
});

// Record a purchase (increases stock)
await stockService.recordMovement({
  companyId: 1,
  itemId: 5,
  variantId: 10,
  outletId: 1,
  type: 'PURCHASE',
  quantity: 100,
  reference: 'PO-456'
});

// Adjust stock
await stockService.recordAdjustment({
  companyId: 1,
  itemId: 5,
  variantId: 10,
  outletId: 1,
  quantity: 95,
  reason: 'Physical count',
  reference: 'ADJ-001'
});
```

### Stock Query

```typescript
// Get current stock for item at outlet
const stock = await stockService.getStock({
  companyId: 1,
  itemId: 5,
  variantId: 10,
  outletId: 1
});

// Get stock history
const movements = await stockService.getMovements({
  companyId: 1,
  itemId: 5,
  variantId: 10,
  outletId: 1,
  from: new Date('2024-01-01'),
  to: new Date('2024-01-31')
});
```

### Recipes

```typescript
import { RecipeService } from '@jurnapod/modules-inventory';

const recipeService = new RecipeService(db);

// Create recipe
await recipeService.createRecipe({
  companyId: 1,
  finishedItemId: latteId,
  ingredients: [
    { itemId: coffeeBeanId, quantity: 20, unit: 'g' },
    { itemId: milkId, quantity: 100, unit: 'ml' }
  ],
  yieldQuantity: 1,
  yieldUnit: 'cup'
});

// Calculate ingredient requirements
const requirements = await recipeService.calculateRequirements(
  1,
  latteId,
  10  // Make 10 lattes
);
// { coffeeBeanId: 200, milkId: 1000 }
```

## Item Types

| Type | Stock Tracking | Variants | Recipes |
|------|---------------|----------|---------|
| **SERVICE** | Never | Yes | No |
| **PRODUCT** | Optional | Yes | Yes |
| **INGREDIENT** | Yes | No | No |
| **RECIPE** | Never | No | No |

## Architecture

```
packages/modules-inventory/
├── src/
│   ├── index.ts                    # Main exports
│   ├── db.ts                       # Database helpers
│   ├── errors.ts                   # Error classes
│   ├── services/                   # Business logic
│   └── interfaces/                  # Service interfaces
```

## Related Packages

- [@jurnapod/modules-inventory-costing](../inventory-costing) - Cost calculations
- [@jurnapod/modules-accounting](../accounting) - Inventory journal posting
- [@jurnapod/db](../../packages/db) - Database connectivity
- [@jurnapod/shared](../../packages/shared) - Shared schemas