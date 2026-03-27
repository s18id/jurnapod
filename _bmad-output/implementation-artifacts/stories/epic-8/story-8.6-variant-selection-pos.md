# Story 8.6: Variant Selection in POS Cart

**Status:** implementation-complete
**Epic:** Epic 8: Production Scale & POS Variant Sync
**Story ID:** 8-6-variant-selection-pos

## Context

POS users need to select product variants (e.g., "Large Coffee" vs "Medium Coffee") and see the correct variant price in the cart. This story implements the UI/UX for variant selection.

## Acceptance Criteria

**AC1: Variant Data Model** ✅
- ✅ `item_variants` table: `id`, `company_id`, `item_id`, `sku`, `name`, `attributes` (JSON), `is_active` (created in migration 0088)
- ✅ Attributes store variant dimensions: `{ size: "Large", color: "Red" }` (migration 0123 adds `attributes` column)
- ✅ SKU must be unique per company (variant has its own SKU)
- ✅ Index on `(company_id, item_id)` and `(company_id, sku)`

**AC2: POS Cart Integration** ✅
- ✅ When adding item to cart, if item has variants: show variant picker modal (existing `VariantSelector.tsx`)
- ✅ Variant picker displays: name, attributes, price (resolved), stock indicator
- ✅ Selected variant stored in cart line: `variant_id` field in cart state
- ✅ Cart displays variant name alongside item name (updated `CartLine.tsx`)

**AC3: Price Display** ✅
- ✅ Cart line shows variant-specific price
- ✅ If variant has no specific price: show item default with visual indicator
- ✅ Price updates immediately when variant changed
- ✅ Discounts apply to variant price (not item default) - uses existing `resolvePrice()`

**AC4: API Endpoints** ✅
- ✅ `GET /api/pos/items/:id/variants` — list variants for item (with current prices)
- ✅ `POST /api/pos/cart/line` — accepts optional `variant_id`
- ✅ Cart calculation uses variant price resolution from Story 8.5

**AC5: E2E Tests** ⚠️ (deferred)
- ⚠️ POS UI already handles variant selection via existing `VariantSelector.tsx` component
- E2E tests deferred to future sprint (requires running server and POS device setup)

## Technical Notes

- POS offline mode: variants sync to local IndexedDB via `variants_cache` table
- Variant images: defer to future epic (use item image for now)
- Variant barcodes: SKU scanning should resolve to variant

## Dependencies

- Story 8.5 (variant price resolution) - ✅ COMPLETE

## Files Created/Modified

### Created:
- `packages/db/migrations/0123_item_variants.sql` - Migration adding `attributes` JSON column
- `apps/api/src/routes/pos-items.ts` - `GET /api/pos/items/:id/variants` endpoint
- `apps/api/src/routes/pos-cart.ts` - `POST /api/pos/cart/line` and `POST /api/pos/cart/validate` endpoints

### Modified:
- `apps/api/src/server.ts` - Registered `posItemVariantsRoutes` and `posCartRoutes`
- `apps/pos/src/features/cart/CartLine.tsx` - Added variant name display, variant indicator, line total
- `apps/pos/src/features/cart/CartList.tsx` - Changed to use variant-aware keys via `getCartLineKey()`
- `apps/pos/src/pages/CartPage.tsx` - Added variant_id state, updated cancel line selection
- `apps/pos/src/offline/sync-pull.ts` - Added variant sync schemas and `mapSyncPullToVariantRows()`
- `apps/api/src/lib/item-variants.ts` - Fixed `getVariantsForSync` IN clause bug (line 986)
- `apps/api/src/lib/item-variants.test.ts` - Added 2 tests for `getVariantsForSync`

## Bug Fix

Fixed `getVariantsForSync()` in `apps/api/src/lib/item-variants.ts`:
- Changed `IN (?)` to `IN (${variantIds.map(() => '?').join(',')})` for proper mysql2 array handling

## Known Issues

1. **Pre-existing test failures**: 7 tests in `variant-price-resolver.test.ts` fail because migration 0122 (`variant_id` column on `item_prices`) hasn't been applied to test database. This is a Story 8.5 debt item.
2. **POS unit tests**: 14 pre-existing failures related to runtime service dine-in/reservation flows (not variant-related)

## Estimated Effort

2.5 days (actual: ~3 days)

## Priority

P0

## Risk Level

Medium (user-facing feature)
