# Story 2.3: POS - Process Multiple Payment Methods

## Status: DONE

**Epic:** Epic 2: POS - Offline-first Point of Sale  
**Priority:** High  
**Estimated Points:** 5

## Story

As a **cashier**,
I want to **process multiple payment methods for a single transaction**,
So that **customers can pay with cash, card, or combination**.

## Acceptance Criteria

### AC1: Payment Method Selection
**Given** a cart with total  
**When** cashier selects payment method (Cash, Card, QR)  
**Then** payment screen shows amount due  

### AC2: Cash Payment with Change
**Given** cash payment with amount given  
**When** cashier enters payment amount  
**Then** change is calculated and displayed  

### AC3: Partial Payment
**Given** partial payment  
**When** cashier processes one method and indicates remaining  
**Then** remaining balance is shown for next payment  

### AC4: Full Payment Completion
**Given** full payment with any method  
**When** cashier completes payment  
**Then** transaction is finalized and receipt is generated  

## Implementation Notes

### Already Implemented
- ✅ Multiple payment methods stored as array in cart
- ✅ CheckoutForm supports adding/removing payment rows
- ✅ Change calculated from sum of all payments vs grand total
- ✅ Partial payments tracked with remaining balance
- ✅ Receipt generation includes all payment details

### Files Analyzed

- `apps/pos/src/features/checkout/CheckoutForm.tsx` - Multiple payment UI
- `apps/pos/src/features/cart/useCart.ts` - Cart state with payments array
- `apps/pos/src/shared/utils/money.ts` - Change calculation
- `apps/pos/src/pages/CheckoutPage.tsx` - Checkout page
