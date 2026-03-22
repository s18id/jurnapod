# Story 15.3.2: Items Routes

Status: review

## Story

As a backoffice user or POS device,
I want to read item/product data via /inventory endpoints,
so that I can access product catalog for sales transactions and inventory.

## User Story

As a user needing item information,
I want to list and view items with filtering capabilities,
so that I can select items for sales transactions and view current pricing.

## Acceptance Criteria

1. **AC-1:** List returns filtered items for company (active status filters) ✅
2. **AC-2:** Get returns item with pricing data ✅
3. **AC-3:** Company scoping enforced ✅
4. **AC-4:** All tests pass ✅

## Tasks / Subtasks

- [x] Task 1: Analyze legacy items routes (AC: 1, 2, 3)
  - [x] Subtask 1.1: Found items routes moved to /api/inventory/items
  - [x] Subtask 1.2: Read legacy inventory items route
  - [x] Subtask 1.3: Identified pricing data structure
- [x] Task 2: Implement GET /inventory/items - List with filtering (AC: 1, 3)
  - [x] Subtask 2.1: Accept query params: is_active, company_id
  - [x] Subtask 2.2: Filter by company_id from auth context
  - [x] Subtask 2.3: Return item list
- [x] Task 3: Implement GET /inventory/items/:id - Single item (AC: 2, 3)
  - [x] Subtask 3.1: Validate item_id format
  - [x] Subtask 3.2: Verify company ownership
  - [x] Subtask 3.3: Return item details
- [x] Task 4: Write 6+ test cases (AC: 4)
  - [x] Subtask 4.1: Test list with various filters
  - [x] Subtask 4.2: Test get with valid/invalid ID
  - [x] Subtask 4.3: Test company scoping enforcement

## Dev Notes

### Technical Context

**Routes Implemented:**
- `apps/api/src/routes/inventory.ts` (GET /inventory/items, GET /inventory/items/:id, POST /inventory/items)
- Framework: Hono
- Complexity: LOW - Read operations with some write support

**Item Data Model:**
- id, sku, name, description, category_id
- company_id, is_active
- Pricing: item_prices table (price_list_id, price, currency)

**Note:** Items are under /inventory path, not /items, per current API structure.

### Implementation Details

- **GET /inventory/items** - List items with filtering (is_active)
- **GET /inventory/items/:id** - Get single item by ID with company scoping
- **POST /inventory/items** - Create new item (full implementation)
- **GET /inventory/item-groups** - List item groups for company
- **GET /inventory/item-prices/active** - Get active prices for outlet

## Dev Agent Record

### Implementation Log

**Date:** 2026-03-22

**Changes:**
1. Created `inventory.ts` Hono route file (note: items are under /inventory, not /items)
2. Implemented routes:
   - GET /inventory/items - List with filtering
   - GET /inventory/items/:id - Get single item
   - POST /inventory/items - Create new item
   - GET /inventory/item-groups - List item groups
   - GET /inventory/item-prices/active - Get active prices for outlet
3. Added Zod validation for query parameters and route params
4. Added requireAccess permission checks
5. Created 16 comprehensive tests

**Completion Notes:**
- Full implementation complete
- TypeScript type check passes
- ESLint passes
- 16 tests passing

### Files Modified

- `apps/api/src/routes/inventory.ts` - Full implementation (266 lines)
- `apps/api/src/routes/inventory.test.ts` - Comprehensive tests (16 tests)

## Change Log

- **2026-03-22:** Implemented inventory routes migration. Items are under /inventory path (per current API structure). List, get, create, item-groups, and active prices endpoints with company scoping and role-based access. 16 tests passing.

## File List

- `apps/api/src/routes/inventory.ts` - Full implementation (266 lines)
- `apps/api/src/routes/inventory.test.ts` - 16 comprehensive tests
