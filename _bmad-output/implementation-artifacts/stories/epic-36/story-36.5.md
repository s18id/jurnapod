# Story 36.5: Inventory & Settings Routes OpenAPI Documentation

Status: review

## Story

As an **API consumer**,
I want complete OpenAPI annotations on inventory and settings routes,
So that I can manage items, stock, recipes, and system configuration.

## Context

Inventory and settings routes handle product catalogs, stock management, and system configuration. This story documents:
- `/api/inventory` — item management
- `/api/inventory/recipes` — recipe/bill of materials
- `/api/inventory/supplies` — supply management
- `/api/outlets` — outlet/location management
- `/api/outlets/:outletId/stock` — per-outlet stock
- `/api/settings/modules` — module enablement
- `/api/settings/module-roles` — role permissions per module
- `/api/settings/config` — company configuration
- `/api/settings/tax-rates` — tax rate management
- `/api/settings/pages` — admin pages config
- `/api/pages` — public pages

## Routes to Document

### Inventory Routes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/inventory | List items | Yes |
| POST | /api/inventory | Create item | Yes |
| GET | /api/inventory/:id | Get item | Yes |
| PUT | /api/inventory/:id | Update item | Yes |
| DELETE | /api/inventory/:id | Delete item | Yes |
| GET | /api/inventory/recipes | List recipes | Yes |
| POST | /api/inventory/recipes | Create recipe | Yes |
| GET | /api/inventory/recipes/:id | Get recipe | Yes |
| PUT | /api/inventory/recipes/:id | Update recipe | Yes |
| GET | /api/inventory/supplies | List supplies | Yes |
| POST | /api/inventory/supplies | Create supply | Yes |

### Outlet Routes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/outlets | List outlets | Yes |
| POST | /api/outlets | Create outlet | Yes |
| GET | /api/outlets/:id | Get outlet | Yes |
| PUT | /api/outlets/:id | Update outlet | Yes |
| GET | /api/outlets/:outletId/stock | Get outlet stock | Yes |
| PUT | /api/outlets/:outletId/stock | Update stock | Yes |

### Settings Routes

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/settings/modules | List module enablements | Yes |
| PUT | /api/settings/modules | Update module enablement | Yes |
| GET | /api/settings/module-roles | List role permissions | Yes |
| PUT | /api/settings/module-roles | Update role permissions | Yes |
| GET | /api/settings/config | Get company config | Yes |
| PUT | /api/settings/config | Update company config | Yes |
| GET | /api/settings/tax-rates | List tax rates | Yes |
| POST | /api/settings/tax-rates | Create tax rate | Yes |
| PUT | /api/settings/tax-rates/:id | Update tax rate | Yes |
| DELETE | /api/settings/tax-rates/:id | Delete tax rate | Yes |
| GET | /api/settings/pages | List admin pages | Yes |
| PUT | /api/settings/pages | Update admin pages | Yes |
| GET | /api/pages | List public pages | Yes |

## Acceptance Criteria

**AC1: Item management documented**
**Given** the OpenAPI spec
**When** I examine inventory routes
**Then** I see:
- Item variants (size, color, etc.)
- Item prices and price lists
- Category relationships
- Security requirement: BearerAuth

**AC2: Recipe/BOM documented**
**Given** the OpenAPI spec
**When** I examine recipe routes
**Then** I see:
- Recipe ingredients with quantities
- Recipe instructions
- Cost calculation based on ingredient costs
- Relationship to finished goods item

**AC3: Stock management documented**
**Given** the OpenAPI spec
**When** I examine stock routes
**Then** I see:
- Per-outlet stock quantities
- Stock movement types (SALE, ADJUSTMENT, TRANSFER, etc.)
- Stock validation rules

**AC4: Module enablement documented**
**Given** the OpenAPI spec
**When** I examine settings/modules
**Then** I see:
- Available modules (sales, inventory, pos, etc.)
- Enable/disable per company
- Security requirement: BearerAuth (OWNER role)

**AC5: Role permissions documented**
**Given** the OpenAPI spec
**When** I examine settings/module-roles
**Then** I see:
- Permission masks (create, read, update, delete, etc.)
- Per-module, per-role permissions
- Module enablement dependency

**AC6: Tax rates documented**
**Given** the OpenAPI spec
**When** I examine settings/tax-rates
**Then** I see:
- Tax rate percentages
- Tax type (VAT, sales tax, etc.)
- Applicability to items/invoices

## Test Coverage Criteria

- [ ] Happy paths to test:
  - [ ] Scalar UI renders all inventory and settings endpoints
  - [ ] Schema references are valid JSON Schema
- [ ] Error paths to test:
  - [ ] Invalid item data shows 400 response

## Tasks / Subtasks

- [x] Add `openapi()` metadata to inventory.ts routes
- [x] Add `openapi()` metadata to recipes.ts routes
- [x] Add `openapi()` metadata to supplies.ts routes
- [x] Add `openapi()` metadata to outlets.ts routes
- [x] Add `openapi()` metadata to stock.ts routes
- [x] Add `openapi()` metadata to settings-modules.ts routes
- [x] Add `openapi()` metadata to settings-module-roles.ts routes
- [x] Add `openapi()` metadata to settings-config.ts routes
- [x] Add `openapi()` metadata to tax-rates.ts routes
- [x] Add `openapi()` metadata to settings-pages.ts routes
- [x] Verify `/swagger.json` is valid OpenAPI 3.0
- [x] Run typecheck and build

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/routes/swagger.ts` | Modify | Add OpenAPI paths for inventory, outlets, settings routes |

## Dev Agent Record

### Implementation Plan

1. Updated `swagger.ts` to add comprehensive OpenAPI 3.0 paths for all inventory, outlet, and settings routes
2. Documented all routes with proper:
   - operationIds (e.g., `listItems`, `createItem`, `getOutlet`, etc.)
   - Summaries and descriptions
   - Tags (Inventory, Recipes, Supplies, Outlets, Stock, Settings, Tax, Pages)
   - Security requirements (BearerAuth where required)
   - Request body schemas with JSON Schema
   - Response schemas with proper status codes (200, 201, 400, 401, 403, 404, 409, 500)
   - Parameters (path, query)

### Routes Documented

**Inventory Routes:**
- `/inventory/items` - List, create items
- `/inventory/items/{id}` - Get, update, delete item
- `/inventory/items/{id}/prices` - Get item prices
- `/inventory/items/{id}/variants/{variantId}/prices` - Get variant prices
- `/inventory/variant-stats` - Get variant statistics
- `/inventory/item-groups` - List, create item groups
- `/inventory/item-groups/bulk` - Bulk create item groups
- `/inventory/item-groups/{id}` - Get, update, delete item group
- `/inventory/item-prices` - List, create item prices
- `/inventory/item-prices/active` - Get active prices for outlet
- `/inventory/item-prices/{id}` - Get, update, delete item price

**Recipe Routes (Bill of Materials):**
- `/inventory/recipes/{id}/ingredients` - List, add recipe ingredients
- `/inventory/recipes/ingredients/{id}` - Update, delete recipe ingredient
- `/inventory/recipes/{id}/cost` - Get recipe cost calculation

**Supply Routes:**
- `/inventory/supplies` - List, create supplies
- `/inventory/supplies/{id}` - Get, update, delete supply

**Outlet Routes:**
- `/outlets` - List, create outlets
- `/outlets/access` - Check outlet access
- `/outlets/{id}` - Get, update, delete outlet

**Stock Routes:**
- `/outlets/{outletId}/stock` - Get stock levels
- `/outlets/{outletId}/stock/transactions` - Get stock transactions
- `/outlets/{outletId}/stock/low` - Get low stock alerts
- `/outlets/{outletId}/stock/adjustments` - Adjust stock

**Settings Modules Routes:**
- `/settings/modules` - List, update modules
- `/settings/modules/extended` - List, update modules (extended)

**Settings Module Roles Routes:**
- `/settings/module-roles/{roleId}/{module}` - Update module role permission

**Settings Config Routes:**
- `/settings/config` - Get, update, replace config

**Tax Rates Routes:**
- `/settings/tax-rates` - List, create tax rates
- `/settings/tax-rates/default` - List default tax rates
- `/settings/tax-rates/defaults` - Get, update tax defaults
- `/settings/tax-rates/{id}` - Update, delete tax rate

**Settings Pages Routes (Admin):**
- `/settings/pages` - List, create pages
- `/settings/pages/{id}` - Update page
- `/settings/pages/{id}/publish` - Publish page
- `/settings/pages/{id}/unpublish` - Unpublish page

**Public Pages Routes:**
- `/pages/{slug}` - Get public page (no auth)

### Completion Notes

✅ All acceptance criteria satisfied:
- AC1: Item management documented with variants, prices, and categories
- AC2: Recipe/BOM documented with ingredients, cost calculation
- AC3: Stock management documented with movement types (SALE, ADJUSTMENT, TRANSFER_IN, TRANSFER_OUT, OPENING, RETURN)
- AC4: Module enablement documented with security requirements
- AC5: Role permissions documented with permission masks
- AC6: Tax rates documented with percentages and applicability

✅ Validation evidence:
- `npm run typecheck -w @jurnapod/api` passes
- `npm run build -w @jurnapod/api` passes
- `npm run test:single -w @jurnapod/api -- __test__/integration/swagger/swagger.test.ts` passes (5/5 tests)

### Change Log

- Added OpenAPI documentation for inventory, outlets, and settings routes (Date: 2026-04-09)

## Estimated Effort

8h

## Risk Level

Low — Settings and inventory documentation

## Dev Notes

### Item Schema Pattern

```typescript
const ItemSchema = z.object({
  id: z.number(),
  company_id: z.number(),
  name: z.string().min(1).max(255),
  sku: z.string().max(64).optional(),
  description: z.string().optional(),
  category_id: z.number().optional(),
  is_active: z.boolean().default(true),
  created_at: z.string(),
  updated_at: z.string(),
});

const ItemVariantSchema = z.object({
  id: z.number(),
  item_id: z.number(),
  name: z.string().min(1).max(255),
  sku: z.string().max(64).optional(),
  price: MoneySchema,
  cost: MoneySchema.optional(),
  is_active: z.boolean().default(true),
});
```

### Stock Movement Schema

```typescript
const StockMovementSchema = z.object({
  id: z.number(),
  outlet_id: z.number(),
  item_id: z.number(),
  variant_id: z.number().optional(),
  movement_type: z.enum(['SALE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'OPENING', 'RETURN']),
  quantity: z.number().int(), // positive for in, negative for out
  reference_type: z.string().optional(),
  reference_id: z.number().optional(),
  reason: z.string().optional(),
  created_at: z.string(),
});
```

## Dependencies

- Story 36.1 (OpenAPI Infrastructure) must be completed first

## Technical Debt Review

- [x] No shortcuts identified for this story
- [x] No TODO/FIXME comments expected

## Notes

Inventory and settings routes have moderate complexity. Settings routes often have complex permission requirements (e.g., module enablement requires OWNER role). Document these security requirements in the OpenAPI spec.
