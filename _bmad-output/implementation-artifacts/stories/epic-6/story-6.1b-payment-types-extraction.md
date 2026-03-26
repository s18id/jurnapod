# Story 6.1b: Payment Types and Functions Extraction

**Status:** completed

**Completed:** 2026-03-26 - Verified and fixed wiring (index.ts now exports from payment-service.ts, routes/sales/payments.ts imports from @/lib/payments)

## Story

As a **Jurnapod developer**,
I want **to extract payment-related types and functions from sales.ts into lib/payments/**,
So that **payment operations are isolated in a focused module**.

## Context

This is part of Story 6.1 (Consolidate Sales Module). `sales.ts` is 4,120 lines and handles multiple domains. This story extracts only the payment-related code.

**Scope:**
- Payment types (SalesPayment, SalesPaymentSplit)
- Payment CRUD functions: listPayments, getPayment, createPayment, updatePayment
- Payment lifecycle: postPayment
- Payment allocation logic

**Files to create:**
- `lib/payments/types.ts` - All payment-related types
- `lib/payments/payment-service.ts` - Payment CRUD operations
- `lib/payments/payment-allocation.ts` - Split and allocation logic
- `lib/payments/index.ts` - Public exports

## Acceptance Criteria

**AC1: Types Extracted**
- All payment types moved to `lib/payments/types.ts`
- Public exports maintained for backward compatibility

**AC2: Functions Extracted**
- Payment CRUD functions moved to `lib/payments/payment-service.ts`
- Allocation logic moved to `lib/payments/payment-allocation.ts`

**AC3: Imports Updated**
- `routes/sales/payments.ts` imports from new module
- All tests still pass

**AC4: Test Coverage**
- Unit tests for payment functions still pass
- No regression in payment API behavior

## Tasks

- [x] Create `lib/payments/` directory
- [x] Extract types to `lib/payments/types.ts`
- [x] Extract payment CRUD to `lib/payments/payment-service.ts`
- [x] Extract allocation logic to `lib/payments/payment-allocation.ts`
- [x] Create `lib/payments/index.ts` with public exports
- [x] Update imports in routes/sales/payments.ts
- [x] Verify tests pass

## Estimated Effort

1.5 days

## Risk Level

Medium (core financial module)

## Dependencies

None (can run parallel with other 6.1 sub-stories)
