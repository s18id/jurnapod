# Story 6.1c: Order Types and Functions Extraction

**Status:** backlog

## Story

As a **Jurnapod developer**,
I want **to extract order-related types and functions from sales.ts into lib/orders/**,
So that **order operations are isolated in a focused module**.

## Context

This is part of Story 6.1 (Consolidate Sales Module). `sales.ts` is 4,120 lines and handles multiple domains. This story extracts only the order-related code.

**Scope:**
- Order types (SalesOrder, SalesOrderLine, SalesOrderDetail)
- Order CRUD functions: listOrders, getOrder, createOrder, updateOrder
- Order lifecycle: confirmOrder, completeOrder, voidOrder, convertOrderToInvoice

**Files to create:**
- `lib/orders/types.ts` - All order-related types
- `lib/orders/order-service.ts` - Order CRUD operations
- `lib/orders/order-lifecycle.ts` - State machine and conversions
- `lib/orders/index.ts` - Public exports

## Acceptance Criteria

**AC1: Types Extracted**
- All order types moved to `lib/orders/types.ts`
- Public exports maintained for backward compatibility

**AC2: Functions Extracted**
- Order CRUD functions moved to `lib/orders/order-service.ts`
- Lifecycle/state machine moved to `lib/orders/order-lifecycle.ts`

**AC3: Imports Updated**
- `routes/sales/orders.ts` imports from new module
- All tests still pass

**AC4: Test Coverage**
- Unit tests for order functions still pass
- No regression in order API behavior

## Tasks

- [ ] Create `lib/orders/` directory
- [ ] Extract types to `lib/orders/types.ts`
- [ ] Extract order CRUD to `lib/orders/order-service.ts`
- [ ] Extract lifecycle to `lib/orders/order-lifecycle.ts`
- [ ] Create `lib/orders/index.ts` with public exports
- [ ] Update imports in routes/sales/orders.ts
- [ ] Verify tests pass

## Estimated Effort

1.5 days

## Risk Level

Medium (core financial module)

## Dependencies

Story 6.1a (invoices) should complete first as orders can convert to invoices

## Files to Modify

- `apps/api/src/lib/sales.ts` - Remove extracted order code
- `apps/api/src/routes/sales/orders.ts` - Update imports
