# Story 2.1: POS Cart - Add Items & Quantities

Status: in-progress

## Story

As a **cashier**,
I want to **add items to a sale with quantities**,
So that **I can ring up customer purchases**.

## Acceptance Criteria

1. **Given** a logged-in cashier at POS screen  
   **When** they search/select an item and specify quantity  
   **Then** the item is added to the cart with line total calculated

2. **Given** an item with outlet-specific price  
   **When** the item is added to cart  
   **Then** the outlet's price is used

3. **Given** items already in the cart  
   **When** cashier adds more items  
   **Then** all items remain in cart with running total

4. **Given** an invalid item or out-of-stock item  
   **When** cashier attempts to add it  
   **Then** an error message is displayed

## Tasks / Subtasks

- [x] Task 1: POS Cart State Management (AC: #1, #2, #3)
  - [x] Subtask 1.1: Cart store/state (add, update quantity, remove items)
  - [x] Subtask 1.2: Item search/filter by outlet inventory
  - [x] Subtask 1.3: Running total calculation
- [x] Task 2: Price Resolution (AC: #2)
  - [x] Subtask 2.1: Resolve outlet-specific price vs company default
  - [x] Subtask 2.2: Handle missing price gracefully
- [x] Task 3: Validation (AC: #4 - partial)
  - [x] Subtask 3.1: Validate item exists and is available (checked via is_active)
  - [ ] Subtask 3.2: Check stock levels (NOT IMPLEMENTED - requires stock_qty in ProductCacheRow)
  - [ ] Subtask 3.3: Display appropriate error messages (for stock validation)

## Dev Notes

### Architecture Patterns

- **Cart State**: Local state (Zustand/React Context) - offline-first
- **Price Resolution**: Client-side lookup from item_prices (outlet-specific first, then company default)
- **Offline Support**: Cart persists locally, syncs on connectivity

### Source Tree Components

- **POS App**: `apps/pos/src/...`
- **Cart Logic**: `apps/pos/src/stores/cart.ts` or similar
- **Item Lookup**: `apps/pos/src/lib/items.ts`

### Testing Standards

- Test add item to cart
- Test quantity update
- Test price resolution (outlet vs company)
- Test invalid item error
- Test cart persistence (offline)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.1]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Cart functionality fully implemented in `apps/pos/src/features/cart/useCart.ts`
- Product lookup with outlet-specific pricing in `runtime-service.ts`
- Stock quantity validation NOT IMPLEMENTED - requires:
  - Add `stock_qty` field to ProductCacheRow schema
  - Update sync pull to include stock data
  - Add validation in cart upsertCartLine
- Current behavior: All active products can be added (stock not tracked)
