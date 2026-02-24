# ADR-0002: Item Types Taxonomy

## Status
Accepted

## Context

Jurnapod supports four item types in the `items` table: SERVICE, PRODUCT, INGREDIENT, and RECIPE. These types exist in the database schema but lack clear documentation on their intended usage and behavioral differences.

The system targets coffee shops and service businesses, with an optional inventory module (levels 0/1/2). Currently, inventory is at level 0 (no tracking), but future levels will add stock movements (level 1) and recipe/BOM functionality (level 2).

## Decision

We define the four item types with the following semantics:

### 1. SERVICE
**Purpose**: Non-tangible offerings sold to customers

**Characteristics**:
- Cannot be inventoried (no physical stock)
- Sold by time/effort, not quantity
- No recipe/BOM composition

**Examples**:
- Labor charges (barista service, cleaning)
- Delivery fees
- Consulting services
- Event catering services

**Inventory Module**:
- Level 0-2: Never tracked in inventory (services have no stock)

---

### 2. PRODUCT
**Purpose**: Finished goods sold directly to customers

**Characteristics**:
- Physical or prepared items
- May have inventory tracking (optional)
- May be composed from recipes (when inventory level 2 enabled)
- Default item type in UI

**Examples**:
- Coffee drinks (latte, espresso, cappuccino)
- Pastries and baked goods
- Packaged retail items (coffee beans for retail)
- Ready-to-eat meals

**Inventory Module**:
- Level 0: No tracking (current)
- Level 1: Optional stock tracking
- Level 2: Can be linked to recipes/BOMs

---

### 3. INGREDIENT
**Purpose**: Raw materials used to make products

**Characteristics**:
- Not typically sold directly (but system allows flexibility)
- Used in recipe composition
- Requires inventory tracking when used in production

**Examples**:
- Coffee beans (raw)
- Milk, sugar, syrups
- Flour, eggs, butter
- Cups, lids, straws (consumables)

**Inventory Module**:
- Level 0: Can be created but no tracking
- Level 1: Stock tracking enabled (purchase → usage)
- Level 2: Used in recipe BOMs, automatic deduction

**Note**: While ingredients are typically not sold directly, the system allows it for flexibility (e.g., selling bags of coffee beans to retail customers). Users should create separate PRODUCT items for retail sales.

---

### 4. RECIPE
**Purpose**: Bill of Materials (BOM) / formulas for making products

**Characteristics**:
- Templates, not physical items
- Define how to make a PRODUCT from INGREDIENTs
- Should not have prices (the PRODUCT has the price)
- Should not be sold directly via POS

**Examples**:
- "Latte Recipe" (1 espresso shot + 250ml milk + 1 pump vanilla)
- "Chocolate Chip Cookie Recipe" (flour + sugar + chocolate chips)
- "House Blend Coffee Recipe" (60% arabica + 40% robusta)

**Inventory Module**:
- Level 0-1: Can be created but not functional
- Level 2: Active BOM functionality (product creation auto-deducts ingredients)

**Note**: In level 0-1, RECIPE type is essentially "reserved" for future use. Users can create recipes as documentation, but they won't affect inventory.

---

## Current Behavior (All Types)

**As of inventory level 0**, all four types behave identically:
- ✅ Can have prices set per outlet
- ✅ Can be sold via POS
- ✅ Sync to POS devices
- ✅ Generate journal entries when sold
- ❌ No stock tracking
- ❌ No recipe/BOM functionality

This allows maximum flexibility during early adoption while the schema supports future inventory features.

---

## Future Behavior (Inventory Level 1)

When `inventory.enabled` level 1 is activated:

| Type | Stock Tracking | Purchase Orders | Stock Movements |
|------|---------------|----------------|-----------------|
| SERVICE | No | No | No |
| PRODUCT | Optional | Yes | Yes |
| INGREDIENT | Yes | Yes | Yes |
| RECIPE | No | No | No |

---

## Future Behavior (Inventory Level 2)

When `inventory.enabled` level 2 is activated:

| Type | Recipe/BOM | Auto-Deduction | Production Orders |
|------|-----------|----------------|-------------------|
| SERVICE | No | No | No |
| PRODUCT | Can be produced from recipe | N/A | Yes |
| INGREDIENT | Used in recipes | Yes (when product made) | No |
| RECIPE | Defines BOM | N/A | Used as template |

**Example workflow**:
1. RECIPE "Latte" defines: 1 espresso shot + 250ml milk
2. When cashier sells 1 PRODUCT "Latte" via POS
3. System auto-deducts from inventory: 1 espresso shot, 250ml milk
4. Journal entries created for revenue + COGS

---

## Validation Rules

### Current (Level 0)
- ✅ All types can be created
- ✅ All types can have prices
- ✅ All types can be sold via POS
- ⚠️ UI shows soft warnings for unusual patterns (e.g., selling ingredients directly)

### Future (Level 1+)
- ❌ SERVICE items cannot be added to inventory
- ⚠️ Warning when setting price on RECIPE items (should price the PRODUCT instead)
- ✅ INGREDIENT items can be sold (flexibility for retail scenarios)

### Never Enforced
We do NOT hard-block any combinations. Users may have legitimate edge cases:
- Selling ingredients retail (bags of coffee beans)
- Service items with associated materials
- Hybrid scenarios

**Philosophy**: Guide with warnings, don't restrict with hard blocks.

---

## UI Guidelines

### Backoffice Item Creation
- Default to "PRODUCT" type
- Show tooltip explaining each type
- Display usage examples
- Soft warning if unusual combination detected

### POS
- Display all active items with prices (type-agnostic)
- Future: Badge/icon indicating item type
- Future: Warning if inventory low (PRODUCT/INGREDIENT only)

---

## Migration Strategy

### Existing Data
- No automatic migration required
- Existing items remain as-is
- Users can manually recategorize if needed
- Default for new items: PRODUCT

### Seed Data
Include example items of each type:
- SERVICE: "Delivery Fee"
- PRODUCT: "Latte", "Cappuccino", "Croissant"
- INGREDIENT: "Coffee Beans", "Milk", "Sugar"
- RECIPE: "Latte Recipe" (for documentation, level 2 will make it functional)

---

## Consequences

### Positive
- ✅ Clear semantics for each item type
- ✅ Future-proof for inventory levels 1-2
- ✅ Flexible enough for edge cases
- ✅ Gradual adoption path (level 0 → 1 → 2)

### Negative
- ⚠️ Users may be confused about when to use each type initially
- ⚠️ Need good documentation and UI hints
- ⚠️ RECIPE items are "placeholder" until level 2

### Mitigation
- Comprehensive tooltips in UI
- User guide in docs
- Soft warnings for unusual patterns
- Clear documentation of current vs. future behavior

---

## Related Documents

- `docs/guides/item-types-user-guide.md` - User-facing documentation
- `packages/shared/src/schemas/master-data.ts` - Schema definition with comments
- `AGENTS.md` - Technical context for developers

---

## Revision History

- 2026-02-23: Initial version (inventory level 0)
- Future: Update when inventory levels 1-2 are implemented

---

## Decision Makers

- Technical Lead: Based on coffee shop ERP industry patterns
- Product: Flexibility prioritized over strict enforcement
- Engineering: Designed for gradual feature rollout
