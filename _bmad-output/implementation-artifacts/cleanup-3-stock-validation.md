# Cleanup Task: Implement Stock Validation System

## Status: ready-for-dev

**Type**: Technical Debt (Epic 2.1 Incomplete)  
**Priority**: P1 - High (Prevents Overselling)  
**Estimated Points**: 8  
**Estimated Hours**: 12

## Story

As a **cashier**,  
I want **the system to validate item availability before adding to cart**,  
So that **I cannot sell items that are out of stock**.

## Background

Story 2.1 (POS Cart) was marked DONE, but stock validation was explicitly deferred. The AC states "Given an invalid item or out-of-stock item, When cashier attempts to add it, Then an error message is displayed" - but this is not implemented.

**Current Behavior:**
- All active products can be added to cart regardless of stock
- No validation against available quantity
- Risk of overselling

**Required Behavior:**
- Check stock quantity before adding to cart
- Prevent sale if stock insufficient
- Update stock after successful sale

## Acceptance Criteria

### AC1: Add Stock Field to Product Cache
**Given** the ProductCacheRow type  
**When** items are cached for offline use  
**Then** stock quantity is included

**Schema Changes:**
```typescript
// packages/pos-sync/src/types/pos-data.ts
interface ProductCacheRow {
  id: number;
  name: string;
  price: number;
  // ... existing fields
  stock_qty: number;  // NEW: Current stock quantity
  stock_updated_at: string;  // NEW: When stock was last synced
}
```

**Migration:**
```sql
-- packages/db/migrations/0112_add_stock_to_product_cache.sql
ALTER TABLE product_cache 
ADD COLUMN stock_qty INT NOT NULL DEFAULT 0,
ADD COLUMN stock_updated_at DATETIME NULL;

CREATE INDEX idx_product_cache_stock ON product_cache(stock_qty);
```

### AC2: Sync Stock Data from Server
**Given** product sync from server  
**When** items are cached  
**Then** stock quantities are included

**Update Sync Logic:**
- Modify pull query to include `stock_qty` from `items` table
- Ensure stock_updated_at reflects sync time
- Handle null/undefined stock as 0 (safe default)

**Files to Modify:**
- `packages/pos-sync/src/core/pos-data-service.ts` - Update queries
- `packages/pos-sync/src/types/pos-data.ts` - Add field to interface

### AC3: Validate Stock Before Adding to Cart
**Given** an item with limited stock  
**When** cashier attempts to add more than available  
**Then** error is shown and item not added

**Validation Logic:**
```typescript
// apps/pos/src/lib/cart-validation.ts
export function validateStock(
  productId: number, 
  requestedQty: number,
  cart: CartItem[]
): ValidationResult {
  const product = getProductFromCache(productId);
  const currentCartQty = cart
    .filter(item => item.product_id === productId)
    .reduce((sum, item) => sum + item.qty, 0);
  
  const totalRequested = currentCartQty + requestedQty;
  const availableStock = product.stock_qty || 0;
  
  if (totalRequested > availableStock) {
    return {
      valid: false,
      error: `Only ${availableStock} available in stock`,
      available: availableStock,
      requested: totalRequested
    };
  }
  
  return { valid: true };
}
```

**UI Behavior:**
- Show error toast: "Insufficient stock. Only X available."
- Do not add item to cart
- Disable "Add to Cart" button if stock is 0
- Show stock quantity indicator in product list

### AC4: Update Stock After Sale
**Given** a completed sale  
**When** transaction is saved  
**Then** stock quantities are decremented

**Update Logic:**
```typescript
// apps/pos/src/lib/offline/sales.ts
export async function saveSale(sale: Sale): Promise<void> {
  // ... existing save logic
  
  // Decrement stock for each item
  for (const item of sale.items) {
    await decrementStock(item.product_id, item.qty);
  }
  
  // Add to outbox for sync
  await addToOutbox(sale);
}

async function decrementStock(productId: number, qty: number): Promise<void> {
  await db.product_cache.update(productId, {
    stock_qty: stock_qty - qty,
    stock_updated_at: new Date().toISOString()
  });
}
```

### AC5: Handle Edge Cases
**Given** various stock scenarios  
**When** validation runs  
**Then** appropriate behavior occurs

**Edge Cases:**
- **Stock = 0**: Item shows "Out of Stock", button disabled
- **Stock < Requested**: Error shows available quantity
- **Stock = null/undefined**: Treat as 0 (safe default)
- **Negative stock**: Should not occur, but treat as 0
- **Stock stale (> 1 hour old)**: Show warning indicator
- **Offline with unknown stock**: Allow sale but flag for review

### AC6: Server-Side Stock Validation
**Given** a sync request  
**When** server receives transaction  
**Then** it validates stock hasn't gone negative

**Server Validation:**
```typescript
// apps/api/app/api/transactions/sync/route.ts
async function validateServerStock(
  items: SaleItem[],
  companyId: number
): Promise<ValidationResult> {
  for (const item of items) {
    const [result] = await db.query(
      `SELECT stock_qty FROM items 
       WHERE id = ? AND company_id = ?`,
      [item.product_id, companyId]
    );
    
    if (!result || result.stock_qty < item.qty) {
      return {
        valid: false,
        error: `Insufficient stock for item ${item.product_id}`,
        item_id: item.product_id
      };
    }
  }
  return { valid: true };
}
```

**Server-Side Decrement:**
```sql
UPDATE items 
SET stock_qty = stock_qty - ?,
    updated_at = NOW()
WHERE id = ? AND company_id = ? AND stock_qty >= ?
```

### AC7: Testing
**Given** the stock validation system  
**When** tests run  
**Then** all scenarios are covered

**Test Cases:**
- Add item within stock limit (success)
- Add item exceeding stock (error)
- Add multiple items up to stock limit (success)
- Add item exactly at stock limit (success)
- Add item when stock = 0 (error)
- Complete sale decrements stock
- Sync decrements server stock
- Concurrent sales don't oversell (race condition test)
- Stock sync from server updates local cache

## Technical Requirements

### Files to Create/Modify

**New Files:**
1. `packages/db/migrations/0112_add_stock_to_product_cache.sql` - Schema migration
2. `apps/pos/src/lib/cart-validation.ts` - Validation logic
3. `apps/pos/src/components/StockIndicator.tsx` - UI component

**Modified Files:**
4. `packages/pos-sync/src/types/pos-data.ts` - Add stock fields
5. `packages/pos-sync/src/core/pos-data-service.ts` - Include stock in sync
6. `apps/pos/src/components/Cart.tsx` - Add validation call
7. `apps/pos/src/components/ProductList.tsx` - Show stock indicator
8. `apps/pos/src/lib/offline/sales.ts` - Decrement stock on sale
9. `apps/api/app/api/transactions/sync/route.ts` - Server validation

### Data Flow

```
Server (items.stock_qty)
    ↓ (sync pull)
POS Cache (product_cache.stock_qty)
    ↓ (add to cart)
Validation (check stock_qty >= requested)
    ↓ (complete sale)
Decrement Cache Stock
    ↓ (sync push)
Decrement Server Stock
```

### Stock Sync Strategy

**Pull (Server → POS):**
- Include `stock_qty` in product sync
- Set `stock_updated_at` to sync timestamp
- Update cache with new stock values

**Push (POS → Server):**
- Server validates stock before accepting transaction
- Server decrements stock atomically
- Conflicts resolved server-side (last-write-wins for stock)

### Offline Considerations

**Problem:** Stock may be stale when offline
**Solutions:**
1. Show last sync time for stock data
2. Allow sale but flag for review if stock old (> 1 hour)
3. Server reconciliation: if oversold, flag transaction for manual review
4. Future: Implement optimistic locking with version numbers

## Implementation Notes

### Database Compatibility
- MySQL 8.0+ and MariaDB compatible
- Default stock_qty = 0 (safe default)
- Nullable stock_updated_at for backward compatibility

### Performance
- Stock validation is synchronous (< 10ms)
- Local cache lookup (IndexedDB)
- No server calls during validation (offline-friendly)

### Security
- Tenant isolation: Validate company_id on all stock queries
- Prevent negative stock: Database constraint + application check
- Audit trail: Log stock changes (future enhancement)

## Dev Notes

### Dependencies
- Requires product sync to include stock data
- Depends on Epic 1 auth for API calls
- Requires IndexedDB schema migration

### Testing Strategy
**Unit Tests:**
- Stock validation logic
- Edge case handling
- Cart quantity calculations

**Integration Tests:**
- End-to-end add-to-cart flow
- Sale completion stock update
- Sync stock decrement

**E2E Tests:**
- Complete sale with stock validation
- Oversell prevention
- Stock sync accuracy

### Deployment Plan
1. Deploy schema migration (adds columns, no breaking changes)
2. Deploy server-side stock validation
3. Deploy POS updates (validation + UI)
4. Monitor for stock discrepancies

### Rollback Plan
- If issues: Disable validation (feature flag)
- Schema changes are additive only (safe)
- Stock data can be resynced from server

## Dev Agent Record

### Agent Model Used
TBD

### Debug Log References
TBD

### Completion Notes
TBD

### File List
- packages/db/migrations/0112_add_stock_to_product_cache.sql (new)
- apps/pos/src/lib/cart-validation.ts (new)
- apps/pos/src/components/StockIndicator.tsx (new)
- packages/pos-sync/src/types/pos-data.ts (modify)
- packages/pos-sync/src/core/pos-data-service.ts (modify)
- apps/pos/src/components/Cart.tsx (modify)
- apps/pos/src/components/ProductList.tsx (modify)
- apps/pos/src/lib/offline/sales.ts (modify)
- apps/api/app/api/transactions/sync/route.ts (modify)
