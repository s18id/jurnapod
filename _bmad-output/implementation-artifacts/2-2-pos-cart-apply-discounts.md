# Story 2.2: POS Cart - Apply Discounts

## Status: DONE

**Epic:** Epic 2: POS - Offline-first Point of Sale  
**Priority:** High  
**Estimated Points:** 5

## Story

As a **cashier**,
I want to **apply discounts to transactions**,
So that **customers receive promotional pricing**.

## Acceptance Criteria

### AC1: Percentage Discount
**Given** items in the cart  
**When** cashier applies a percentage discount  
**Then** discount is calculated and subtracted from subtotal  

### AC2: Fixed Amount Discount
**Given** items in the cart  
**When** cashier applies a fixed amount discount  
**Then** discount is subtracted from subtotal  

### AC3: Discount Codes
**Given** a discount code entered  
**When** system validates the code  
**Then** valid codes are applied, invalid codes show error  

### AC4: Multiple Discounts Order
**Given** multiple discounts applied  
**When** calculating final total  
**Then** discounts are applied in correct order (percentage first, then fixed)  

### AC5: Discount Cap
**Given** discount exceeds transaction total  
**Then** total cannot go below zero  

## Implementation Notes

### Current State
- ✅ Per-line discount_amount already implemented in useCart.ts
- ✅ discount_total computed from line items in money.ts
- ❌ Transaction-level percentage discount not implemented
- ❌ Transaction-level fixed discount not implemented
- ❌ Discount code validation not implemented

### Changes Required

1. **money.ts**: Add transaction-level discount fields to CartTotals
2. **useCart.ts**: Add discount_percent, discount_fixed, discount_code to state
3. **RuntimeService/OfflineDB**: Persist transaction-level discounts
4. **API**: Validate discount codes (future - requires promo table)

### Discount Order
```
1. subtotal = sum(qty * price_snapshot) for all lines
2. line_discount_total = sum(line.discount_amount)
3. after_line_discounts = subtotal - line_discount_total
4. percent_discount_amount = after_line_discounts * discount_percent / 100
5. after_percent = after_line_discounts - percent_discount_amount
6. final_total = max(0, after_percent - discount_fixed)
```

## Files Analyzed

- `apps/pos/src/features/cart/useCart.ts` - Cart state management
- `apps/pos/src/shared/utils/money.ts` - Total calculations
- `apps/pos/src/services/runtime-service.ts` - Product catalog
