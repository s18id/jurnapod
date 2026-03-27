# Story 8.5: Variant Price Sync Enhancement

**Status:** ready-for-dev
**Epic:** Epic 8: Production Scale & POS Variant Sync
**Story ID:** 8-5-variant-price-sync

## Context

The Q3 2026 roadmap requires Variant-Level Sync for POS — products with multiple variants (size, color, etc.) each having independent pricing. Building on the item-prices domain isolation from Epic 3, we extend sync to support variant-level prices.

## Acceptance Criteria

**AC1: Variant Price Schema**
- Extend `item_prices` table to support `variant_id` column (nullable, FK to `item_variants`)
- Migration must handle existing data (variant_id = NULL for base prices)
- Unique constraint: `(company_id, item_id, variant_id, outlet_id, effective_from)` — allows NULL variant_id
- Index on `(company_id, variant_id)` for variant price lookups

**AC2: Variant Price API**
- Extend price CRUD to include `variant_id` parameter
- `GET /api/items/:id/variants/:variantId/prices` — list variant-specific prices
- Price resolution priority: variant-specific > item-default > global-default
- Validation: variant must belong to item (company-scoped)

**AC3: Sync Schema Update**
- Extend sync pull/push contracts in `packages/shared/src/contracts/`
- Add `variantPrices` entity type to sync registry
- Sync record format: `{ itemId, variantId, outletId, price, effectiveFrom, effectiveTo }`
- Maintain backward compatibility (existing POS without variant support continues to work)

**AC4: Price Resolution Logic**
- Create `resolvePrice(itemId, variantId?, outletId?, date?)` function
- Resolution order:
  1. Variant-specific price for outlet (if variantId provided)
  2. Item-default price for outlet
  3. Global-default price
- Cache resolved prices for 60 seconds (configurable)

**AC5: Integration Tests**
- Test: Variant price overrides item price in POS
- Test: Missing variant price falls back to item price
- Test: Sync push/pull roundtrip preserves variant prices
- Test: Company isolation — variant prices don't leak
- Test: Effective date ranges work for variant prices

## Technical Notes

- Leverage existing item-prices domain from Epic 3
- Variant prices follow same validation rules as item prices
- Consider price matrix UI for managing multiple variant/outlet combinations

## Dependencies

- Epic 3 (item-prices domain isolation)
- Story 8.8 (for sync push)

## Estimated Effort

2 days

## Priority

P0

## Risk Level

Medium (schema change affecting POS)
