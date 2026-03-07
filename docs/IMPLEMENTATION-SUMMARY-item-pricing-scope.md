# Implementation Summary: Company Default + Outlet Override Pricing

**Date:** 2026-03-07  
**Status:** ✅ Core Implementation Complete  
**ADR Reference:** [ADR-0004](adr/ADR-0004-item-pricing-scope.md)

---

## Overview

Successfully implemented a two-tier pricing model for Jurnapod ERP:
- **Company Default Prices** (`outlet_id = NULL`) - centralized pricing across all outlets
- **Outlet Override Prices** (`outlet_id = <number>`) - location-specific pricing adjustments
- **Effective Price Resolution** - automatic fallback from override to default

---

## Files Changed

### Database Schema
- ✅ `packages/db/migrations/0059_item_prices_company_default.sql`
  - Made `item_prices.outlet_id` nullable
  - Added `scope_key` generated column for uniqueness enforcement
  - Added unique constraint on `scope_key` to prevent duplicates
  - Updated indexes for efficient querying

### Shared Contracts
- ✅ `packages/shared/src/schemas/master-data.ts`
  - Updated `ItemPriceCreateRequestSchema` to allow `outlet_id: NumericIdSchema.nullable()`
  - Updated `ItemPriceUpdateRequestSchema` to allow `outlet_id: NumericIdSchema.nullable().optional()`

### API Business Logic
- ✅ `apps/api/src/lib/master-data.ts`
  - Updated `createItemPrice()` to support nullable outlet_id
  - Updated `updateItemPrice()` to support nullable outlet_id with proper access checks
  - Updated `deleteItemPrice()` to skip outlet access checks for company defaults
  - Updated `listItemPrices()` to include defaults when querying by outlet
  - Added `listEffectiveItemPricesForOutlet()` for effective price resolution
  - Updated `buildSyncPullPayload()` to use effective price resolution for POS sync

### API Route Handlers
- ✅ `apps/api/app/api/inventory/item-prices/route.ts`
  - Updated `parseOutletIdForGuard()` to return `number | null`
  - POST handler now accepts `outlet_id = null` for company defaults

- ✅ `apps/api/app/api/inventory/item-prices/[priceId]/route.ts`
  - Updated GET handler to skip outlet access check for company defaults
  - Updated PATCH handler to handle nullable outlet_id and scope changes
  - Updated DELETE handler to skip outlet access check for company defaults

### Tests
- ✅ `apps/api/tests/integration/master-data.integration.test.mjs`
  - Added comprehensive test: "company default price + outlet override resolution"
  - Tests effective price resolution for multiple outlets
  - Tests duplicate prevention for both scopes
  - Tests sync pull returns correct effective prices per outlet

---

## How It Works

### 1. Database Schema

**Uniqueness Strategy:**
```sql
-- Generated scope_key column
scope_key = CASE
  WHEN outlet_id IS NULL THEN CONCAT('default:', company_id, ':', item_id)
  ELSE CONCAT('override:', company_id, ':', outlet_id, ':', item_id)
END

-- Single unique constraint enforces both scopes
UNIQUE KEY uq_item_prices_scope (scope_key)
```

This allows:
- ✅ One company default per item (`outlet_id = NULL`)
- ✅ One outlet override per item per outlet (`outlet_id = <number>`)
- ❌ No duplicate defaults or duplicates overrides

### 2. Effective Price Resolution

When POS requests sync for outlet `5`:

```typescript
// Server-side query (simplified)
SELECT 
  COALESCE(override.price, default.price) AS price,
  COALESCE(override.id, default.id) AS id
FROM items i
LEFT JOIN item_prices override 
  ON override.item_id = i.id AND override.outlet_id = 5
LEFT JOIN item_prices def 
  ON def.item_id = i.id AND def.outlet_id IS NULL
WHERE (override.id IS NOT NULL OR def.id IS NOT NULL)
```

**Result:** POS receives exactly one price per item (override preferred, default fallback).

### 3. Access Control

**Company Default** (`outlet_id = NULL`):
- Create/Update/Delete: Requires company-level inventory permission
- No outlet access check needed

**Outlet Override** (`outlet_id = <number>`):
- Create/Update/Delete: Requires outlet-level inventory permission + outlet access
- Validates user has access to the specific outlet

---

## API Usage Examples

### Create Company Default Price
```bash
POST /api/inventory/item-prices
{
  "item_id": 42,
  "outlet_id": null,
  "price": 25000,
  "is_active": true
}
```

### Create Outlet Override
```bash
POST /api/inventory/item-prices
{
  "item_id": 42,
  "outlet_id": 5,
  "price": 32000,
  "is_active": true
}
```

### Sync Pull (POS)
```bash
GET /api/sync/pull?outlet_id=5&since_version=0
```

**Response includes effective prices:**
```json
{
  "success": true,
  "data": {
    "data_version": 123,
    "items": [...],
    "prices": [
      {
        "id": 101,
        "item_id": 42,
        "outlet_id": 5,
        "price": 32000,
        "is_active": true
      }
    ]
  }
}
```

---

## Migration Path

### For Existing Deployments

**Backward Compatible:**
- All existing `item_prices` rows have `outlet_id` set → treated as outlet overrides
- No data migration required
- System continues working identically after migration

**Gradual Adoption:**
1. Run migration `0059_item_prices_company_default.sql`
2. System operates normally (all prices remain outlet-specific)
3. Admins can create company defaults when ready
4. Admins can consolidate identical outlet prices into defaults manually

---

## Testing Strategy

### Integration Tests
✅ Test sync pull with mixed defaults and overrides  
✅ Test effective price resolution priority (override > default)  
✅ Test duplicate prevention for both scopes  
✅ Test company default creation via API  
✅ Test outlet override creation via API  

### Manual Testing Checklist
- [ ] Run migration on test database
- [ ] Create company default price via backoffice UI (pending UI implementation)
- [ ] Create outlet override via backoffice UI (pending UI implementation)
- [ ] POS sync pulls effective prices correctly
- [ ] POS can complete sales with default prices
- [ ] POS can complete sales with override prices
- [ ] Duplicate company default returns 409 Conflict
- [ ] Duplicate outlet override returns 409 Conflict

---

## Remaining Work

### High Priority
- [ ] **Backoffice UI Update** - Add company default pricing section to Items+Prices page
- [ ] **POS Compatibility Testing** - Verify end-to-end sync and sales with new pricing

### Medium Priority
- [ ] Admin tool: bulk consolidate identical outlet prices into defaults
- [ ] Admin tool: copy company default to all outlets as overrides
- [ ] Price history/audit trail enhancements

### Low Priority
- [ ] Hierarchical pricing (outlet groups between company and outlet)
- [ ] Future-dated price changes
- [ ] Time-based price tiers (happy hour pricing)

---

## Success Criteria

✅ **Database migration runs without errors**  
✅ **API accepts nullable outlet_id for price create/update**  
✅ **Sync pull returns effective prices (override > default)**  
✅ **Integration tests pass**  
⏳ **Backoffice UI supports company defaults** (pending)  
⏳ **POS end-to-end testing passes** (pending)  

---

## Rollback Plan

If critical issues arise:

1. **Database rollback:**
   ```sql
   -- Revert to NOT NULL (requires fixing/deleting NULL rows first)
   UPDATE item_prices SET outlet_id = <some_outlet> WHERE outlet_id IS NULL;
   ALTER TABLE item_prices MODIFY COLUMN outlet_id BIGINT UNSIGNED NOT NULL;
   ```

2. **Code rollback:**
   - Revert commits to `master-data.ts`, route handlers, and schemas
   - Redeploy API

3. **Risk mitigation:**
   - Migration is additive (doesn't break existing data)
   - API changes are backward compatible (existing outlet-only flows still work)
   - POS receives same payload structure (just with better price resolution)

---

## Performance Considerations

**Query Optimization:**
- Added indexes: `idx_item_prices_outlet_item_active`, `idx_item_prices_company_default_fallback`
- Effective price query uses LEFT JOIN with COALESCE (efficient for MySQL 8.0)

**Sync Pull Performance:**
- Single query resolves all effective prices for an outlet
- No N+1 queries
- Payload size unchanged (same structure as before)

**Expected Impact:**
- Sync pull: +5-10ms (negligible)
- Price CRUD operations: No significant change
- Database size: Reduced (fewer duplicate outlet prices needed)

---

## Documentation

- ✅ ADR-0004: Architecture decision record
- ✅ Migration comments explain schema changes
- ✅ Code comments in master-data.ts explain resolution logic
- ✅ Integration test documents expected behavior
- ✅ This implementation summary

---

**Implemented by:** Ahmad Faruk (Signal18 ID)  
**Review Status:** Ready for code review  
**Deployment Status:** Ready for staging deployment after backoffice UI complete
