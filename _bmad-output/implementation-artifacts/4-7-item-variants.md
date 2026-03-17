# Story 4.7: Item Variants

**Epic:** Items & Catalog - Product Management  
**Status:** backlog → ready-for-dev  
**Priority:** Low  
**Estimated Effort:** 12-16 hours  
**Created:** 2026-03-17  
**Type:** Technical Debt

---

## Context

Epic 4's item management supports basic product management, but lacks the ability to handle product variations like different sizes, colors, or styles. This story adds item variant support to enable businesses to sell the same product in multiple configurations while maintaining a single parent item record.

Examples:
- T-shirt in Small, Medium, Large (size variants)
- Product in Red, Blue, Black (color variants)
- Product with both size AND color variants (S/Red, M/Red, L/Red, S/Blue, etc.)

---

## Story

As a **store manager**,  
I want to **create product variants (size, color, style)** for items,  
So that **I can sell the same product in different configurations with independent pricing and stock tracking**.

---

## Acceptance Criteria

### Variant Definition

**Given** an existing item  
**When** manager defines variant attributes (e.g., "Size" with values ["S", "M", "L"])  
**Then** the variant definition is saved and available for all child variants

**Given** multiple variant attributes (e.g., Size AND Color)  
**When** manager defines both  
**Then** all combinations are generated (S/Red, S/Blue, M/Red, M/Blue, etc.)

**Given** a variant attribute  
**When** manager adds or removes values  
**Then** child variants are automatically created or archived

### Variant Management

**Given** generated variants  
**When** manager views variants  
**Then** each variant displays with:
- Variant SKU (auto-generated or custom)
- Variant name (e.g., "T-Shirt - Red, Small")
- Independent price (inherits from parent by default)
- Independent stock quantity
- Barcode (optional)

**Given** a specific variant  
**When** manager updates variant-specific price  
**Then** only that variant's price changes; parent and other variants unchanged

**Given** a variant with its own price  
**When** manager resets price to inherit from parent  
**Then** price follows parent item price again

**Given** a variant  
**When** manager updates stock quantity  
**Then** only that variant's stock is affected

**Given** a variant  
**When** manager deactivates it  
**Then** variant is hidden from POS but historical transactions preserved

### SKU Generation

**Given** a parent item with SKU "SHIRT-001"  
**When** variants are generated  
**Then** default variant SKUs follow pattern: "SHIRT-001-RED-S", "SHIRT-001-RED-M", etc.

**Given** a generated variant SKU  
**When** manager edits it  
**Then** custom SKU is accepted if unique within company

### POS Integration

**Given** an item with variants  
**When** cashier searches for the item  
**Then** item appears with variant selector in POS

**Given** a variant selected in POS  
**When** transaction is completed  
**Then** correct variant SKU and stock are used

**Given** a variant out of stock  
**When** cashier tries to add it  
**Then** warning shown; item can still be sold if override enabled

### Stock Management

**Given** variants with individual stock  
**When** parent item stock is viewed  
**Then** total = sum of all variant stocks

**Given** a stock adjustment  
**When** applied to a variant  
**Then** only that variant's stock changes

---

## Technical Design

### Database Schema

```sql
-- Migration: 0XXX_create_item_variants.sql

-- Variant attribute definitions (e.g., "Size", "Color")
CREATE TABLE item_variant_attributes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  attribute_name VARCHAR(50) NOT NULL, -- e.g., "Size", "Color"
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  
  INDEX idx_item_attribute (company_id, item_id, attribute_name),
  INDEX idx_sort (company_id, item_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Attribute values (e.g., "S", "M", "L" for Size)
CREATE TABLE item_variant_attribute_values (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  attribute_id BIGINT UNSIGNED NOT NULL,
  value VARCHAR(50) NOT NULL, -- e.g., "S", "Red"
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (attribute_id) REFERENCES item_variant_attributes(id) ON DELETE CASCADE,
  
  INDEX idx_attribute_value (company_id, attribute_id, value),
  INDEX idx_sort (company_id, attribute_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Individual variant SKUs
CREATE TABLE item_variants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL, -- parent item
  sku VARCHAR(100) NOT NULL,
  variant_name VARCHAR(255) NOT NULL, -- e.g., "Red, Small"
  price_override DECIMAL(15,2) NULL, -- NULL = inherit from parent
  stock_quantity DECIMAL(10,3) DEFAULT 0,
  barcode VARCHAR(100) NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  
  UNIQUE KEY uk_company_sku (company_id, sku),
  INDEX idx_item (company_id, item_id),
  INDEX idx_barcode (company_id, barcode),
  INDEX idx_active (company_id, item_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Link variants to their attribute values
CREATE TABLE item_variant_combinations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  attribute_id BIGINT UNSIGNED NOT NULL,
  value_id BIGINT UNSIGNED NOT NULL,
  
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES item_variants(id) ON DELETE CASCADE,
  FOREIGN KEY (attribute_id) REFERENCES item_variant_attributes(id) ON DELETE CASCADE,
  FOREIGN KEY (value_id) REFERENCES item_variant_attribute_values(id) ON DELETE CASCADE,
  
  UNIQUE KEY uk_variant_attribute (company_id, variant_id, attribute_id),
  INDEX idx_variant (company_id, variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### API Design

```typescript
// Variant Attribute Management
// POST /api/inventory/items/[itemId]/variant-attributes
interface CreateVariantAttributeRequest {
  attribute_name: string;
  values: string[]; // ["S", "M", "L"]
}

// GET /api/inventory/items/[itemId]/variant-attributes
interface VariantAttributeResponse {
  id: number;
  attribute_name: string;
  sort_order: number;
  values: Array<{
    id: number;
    value: string;
    sort_order: number;
  }>;
}

// PATCH /api/inventory/variant-attributes/[attributeId]
interface UpdateVariantAttributeRequest {
  attribute_name?: string;
  sort_order?: number;
  values?: string[]; // Full list - creates/removes as needed
}

// Variant Management
// GET /api/inventory/items/[itemId]/variants
interface ItemVariantResponse {
  id: number;
  item_id: number;
  sku: string;
  variant_name: string;
  price_override: number | null;
  effective_price: number; // Calculated: override or parent price
  stock_quantity: number;
  barcode: string | null;
  is_active: boolean;
  attributes: Array<{
    attribute_name: string;
    value: string;
  }>;
}

// PATCH /api/inventory/variants/[variantId]
interface UpdateVariantRequest {
  sku?: string;
  price_override?: number | null; // null to inherit from parent
  stock_quantity?: number;
  barcode?: string | null;
  is_active?: boolean;
}

// POST /api/inventory/variants/[variantId]/stock-adjustment
interface StockAdjustmentRequest {
  adjustment: number; // positive or negative
  reason: string;
}

// POS Sync Support
// GET /api/sync/outlet/[outletId]/variants
interface SyncVariantResponse {
  id: number;
  item_id: number;
  sku: string;
  variant_name: string;
  price: number; // Effective price
  barcode: string | null;
  is_active: boolean;
  attributes: Record<string, string>; // { "Size": "S", "Color": "Red" }
}
```

### Service Layer

```typescript
// apps/api/src/lib/item-variants.ts

interface VariantAttribute {
  id: number;
  companyId: number;
  itemId: number;
  attributeName: string;
  sortOrder: number;
  values: Array<{
    id: number;
    value: string;
    sortOrder: number;
  }>;
}

interface ItemVariant {
  id: number;
  companyId: number;
  itemId: number;
  sku: string;
  variantName: string;
  priceOverride: number | null;
  stockQuantity: number;
  barcode: string | null;
  isActive: boolean;
  attributes: Array<{
    attributeName: string;
    value: string;
  }>;
}

// Core functions
async function createVariantAttribute(
  companyId: number,
  itemId: number,
  input: CreateVariantAttributeInput
): Promise<VariantAttribute>;

async function updateVariantAttribute(
  companyId: number,
  attributeId: number,
  updates: UpdateVariantAttributeInput
): Promise<VariantAttribute>;

async function deleteVariantAttribute(
  companyId: number,
  attributeId: number
): Promise<void>;

async function getItemVariants(
  companyId: number,
  itemId: number
): Promise<ItemVariant[]>;

async function updateVariant(
  companyId: number,
  variantId: number,
  updates: UpdateVariantInput
): Promise<ItemVariant>;

async function getVariantEffectivePrice(
  companyId: number,
  variantId: number
): Promise<number>;

async function adjustVariantStock(
  companyId: number,
  variantId: number,
  adjustment: number,
  reason: string
): Promise<number>; // Returns new stock

async function generateVariantSku(
  companyId: number,
  itemId: number,
  variantName: string
): Promise<string>;

// Validation
async function validateVariantSku(
  companyId: number,
  sku: string,
  excludeVariantId?: number
): Promise<{ valid: boolean; error?: string }>;
```

---

## Implementation Tasks

### 1. Database (1 hour)
- [ ] Create migration for variant tables
- [ ] Add indexes for performance
- [ ] Test migration on MySQL and MariaDB

### 2. Service Layer (3-4 hours)
- [ ] Create `item-variants.ts` service
- [ ] Implement attribute CRUD with transaction safety
- [ ] Implement variant CRUD operations
- [ ] Add variant SKU generation logic
- [ ] Add effective price calculation
- [ ] Add stock management functions
- [ ] Add audit logging

### 3. API Routes (2-3 hours)
- [ ] `POST /inventory/items/[itemId]/variant-attributes`
- [ ] `GET /inventory/items/[itemId]/variant-attributes`
- [ ] `PATCH /inventory/variant-attributes/[attributeId]`
- [ ] `DELETE /inventory/variant-attributes/[attributeId]`
- [ ] `GET /inventory/items/[itemId]/variants`
- [ ] `PATCH /inventory/variants/[variantId]`
- [ ] `POST /inventory/variants/[variantId]/stock-adjustment`
- [ ] `GET /sync/outlet/[outletId]/variants`
- [ ] Add Zod validation schemas

### 4. UI Components (4-6 hours)
- [ ] Variant attribute manager (add/edit attributes and values)
- [ ] Variant grid/table display with:
  - SKU editing
  - Price override input
  - Stock quantity input
  - Barcode input
  - Active/inactive toggle
- [ ] Bulk operations (activate/deactivate)
- [ ] Variant selector component for POS
- [ ] Price inheritance indicator

### 5. POS Integration (1-2 hours)
- [ ] Update item search to show variant selector
- [ ] Update cart to handle variant items
- [ ] Update transaction sync to include variant_id
- [ ] Update stock validation for variants

### 6. Testing (1-2 hours)
- [ ] Unit tests for service layer
- [ ] API integration tests
- [ ] Variant SKU uniqueness tests
- [ ] Stock adjustment tests
- [ ] POS variant selection tests

---

## Files to Create/Modify

### New Files
```
packages/db/migrations/0XXX_create_item_variants.sql
apps/api/src/lib/item-variants.ts
apps/api/src/lib/item-variants.test.ts
apps/api/app/api/inventory/items/[itemId]/variant-attributes/route.ts
apps/api/app/api/inventory/items/[itemId]/variants/route.ts
apps/api/app/api/inventory/variants/[variantId]/route.ts
apps/api/app/api/inventory/variants/[variantId]/stock-adjustment/route.ts
apps/backoffice/src/features/item-variants-manager.tsx
apps/backoffice/src/features/variant-attribute-editor.tsx
apps/backoffice/src/features/variant-grid.tsx
apps/pos/src/components/variant-selector.tsx
```

### Modified Files
```
apps/backoffice/src/features/items-page.tsx
  - Add "Manage Variants" button
  - Show variant count indicator

apps/api/app/api/sync/outlet/[outletId]/route.ts
  - Include variants in sync payload

apps/api/src/lib/pos-transactions.ts
  - Support variant_id in transaction items
```

---

## Dependencies

- ✅ Items table exists
- ✅ Item types already implemented
- ✅ POS sync infrastructure exists
- 🔧 Barcode support (Story 4.8) - optional integration point

---

## Dev Notes

### SKU Generation Strategy
```typescript
function generateVariantSku(
  parentSku: string,
  variantAttributes: Array<{ name: string; value: string }>
): string {
  // Convert attribute values to SKU-safe format
  const suffix = variantAttributes
    .map(attr => attr.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())
    .join('-');
  
  return `${parentSku}-${suffix}`;
}

// Example: "SHIRT-001" + [{name: "Color", value: "Red"}, {name: "Size", value: "S"}]
// Result: "SHIRT-001-RED-S"
```

### Variant Combination Generation
```typescript
function generateVariantCombinations(
  attributes: Array<{ name: string; values: string[] }>
): Array<Array<{ name: string; value: string }>> {
  if (attributes.length === 0) return [];
  if (attributes.length === 1) {
    return attributes[0].values.map(v => [{ name: attributes[0].name, value: v }]);
  }
  
  const [first, ...rest] = attributes;
  const restCombinations = generateVariantCombinations(rest);
  
  const combinations: Array<Array<{ name: string; value: string }>> = [];
  for (const value of first.values) {
    for (const restCombo of restCombinations) {
      combinations.push([
        { name: first.name, value },
        ...restCombo
      ]);
    }
  }
  
  return combinations;
}
```

### Effective Price Calculation
```typescript
async function getVariantEffectivePrice(
  companyId: number,
  variantId: number,
  outletId?: number
): Promise<number> {
  // Check for variant-specific price override
  const variant = await getVariantById(companyId, variantId);
  if (variant.priceOverride !== null) {
    return variant.priceOverride;
  }
  
  // Fall back to parent item price (with outlet-specific pricing if applicable)
  return await getItemPrice(companyId, variant.itemId, outletId);
}
```

### POS Transaction with Variants
```typescript
// In transaction payload
interface TransactionItem {
  item_id: number;
  variant_id?: number; // NEW: Optional variant reference
  quantity: number;
  price: number;
  // ... other fields
}
```

---

## Definition of Done

- [ ] Database migration created and tested
- [ ] Service layer with full CRUD operations
- [ ] API endpoints with validation
- [ ] UI for managing variant attributes and variants
- [ ] POS integration with variant selector
- [ ] SKU generation working correctly
- [ ] Price inheritance logic working
- [ ] Stock tracking per variant working
- [ ] Tests passing
- [ ] Code review completed
- [ ] Documentation updated

---

**Story Status:** Ready for Development 🔧  
**Next Step:** Delegate to `bmad-dev-story` when ready to implement
