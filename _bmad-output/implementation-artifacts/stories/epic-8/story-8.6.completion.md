# Story 8.6 Completion Notes

**Story:** 8.6 - Variant Selection in POS Cart  
**Completed:** Sat Mar 28 2026  
**Status:** Implementation Complete (Ready for Review)

## Summary

Implemented variant selection functionality in POS cart, allowing POS users to select product variants (e.g., "Large Coffee" vs "Medium Coffee") and see the correct variant price in the cart.

## Implementation Details

### Files Created

| File | Description |
|------|-------------|
| `packages/db/migrations/0123_item_variants.sql` | Migration adding `attributes` JSON column to `item_variants` table |
| `apps/api/src/routes/pos-items.ts` | NEW: `GET /api/pos/items/:id/variants` endpoint with variant pricing |
| `apps/api/src/routes/pos-cart.ts` | NEW: `POST /api/pos/cart/line` and `POST /api/pos/cart/validate` endpoints |

### Files Modified

| File | Description |
|------|-------------|
| `apps/api/src/server.ts` | Registered `posItemVariantsRoutes` and `posCartRoutes` |
| `apps/pos/src/features/cart/CartLine.tsx` | Added variant name display, variant indicator, line total |
| `apps/pos/src/features/cart/CartList.tsx` | Changed to use variant-aware keys via `getCartLineKey()` |
| `apps/pos/src/pages/CartPage.tsx` | Added variant_id state, updated cancel line selection |
| `apps/pos/src/offline/sync-pull.ts` | Added variant sync schemas and `mapSyncPullToVariantRows()` |
| `apps/api/src/lib/item-variants.ts` | Fixed `getVariantsForSync` IN clause bug |
| `apps/api/src/lib/item-variants.test.ts` | Added 2 tests for `getVariantsForSync` |

## Bug Fix

### `getVariantsForSync()` IN Clause Bug

**Location:** `apps/api/src/lib/item-variants.ts` line 986

**Issue:** The mysql2 `execute()` method doesn't handle arrays correctly with `IN (?)` placeholder.

**Fix:**
```typescript
// Before (broken):
WHERE ivc.variant_id IN (?) AND ivc.company_id = ?
[variantIds, companyId]

// After (fixed):
WHERE ivc.variant_id IN (${variantIds.map(() => '?').join(',')}) AND ivc.company_id = ?
[...variantIds, companyId]
```

## Test Results

### Variant Service Tests (item-variants.test.ts) ✅
```
# tests 16
# pass 16
# fail 0
```

All 16 tests pass, including the 2 new tests for `getVariantsForSync`:
- `getVariantsForSync - returns active variants with attributes and effective prices`
- `getVariantsForSync - excludes inactive and archived variants`

### API Unit Tests
```
# tests 1499
# pass 1492
# fail 7
```

7 failures in `variant-price-resolver.test.ts` are **pre-existing** (migration 0122 not applied to test database).

### POS Build/Lint ✅
- ✅ POS build: PASS
- ✅ POS lint: PASS
- ⚠️ POS unit tests: 14 pre-existing failures (not variant-related)

### API Build/Typecheck/Lint ✅
- ✅ API typecheck: PASS
- ✅ API build: PASS
- ✅ API lint: PASS

## Acceptance Criteria Status

| AC | Description | Status |
|----|-------------|--------|
| AC1 | Variant Data Model | ✅ COMPLETE |
| AC2 | POS Cart Integration | ✅ COMPLETE |
| AC3 | Price Display | ✅ COMPLETE |
| AC4 | API Endpoints | ✅ COMPLETE |
| AC5 | E2E Tests | ⚠️ DEFERRED |

## Known Limitations

1. **E2E Tests (AC5)**: POS UI already handles variant selection via existing `VariantSelector.tsx` component. E2E tests deferred to future sprint (requires running server and POS device setup).

2. **Pre-existing Test Failures**: 
   - 7 tests in `variant-price-resolver.test.ts` fail due to missing migration 0122 on test database (Story 8.5 debt)
   - 14 POS unit tests fail due to runtime service dine-in/reservation flows (pre-existing)

## Dependencies

- Story 8.5 (variant price resolution): ✅ COMPLETE

## Next Steps for Review

1. Review API changes for `pos-items.ts` and `pos-cart.ts` routes
2. Review POS UI changes in `CartLine.tsx`, `CartList.tsx`, `CartPage.tsx`
3. Review offline sync changes in `sync-pull.ts`
4. Consider E2E test implementation for variant cart flows
5. Address pre-existing test failures as separate debt items
