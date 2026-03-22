# Story 15.4.2: Order Routes

Status: ready-for-dev

## Story

As a backoffice user or POS device,
I want to create and list orders via /sales/orders endpoints,
so that I can manage sales orders that may convert to invoices.

## User Story

As a user managing the sales process,
I want to create orders that can be tracked and later converted to invoices,
so that I can handle partial fulfillment and quotes.

## Acceptance Criteria

1. **AC-1:** Orders created with proper state management
2. **AC-2:** Integration with invoice conversion works
3. **AC-3:** Company scoping enforced
4. **AC-4:** All tests pass

## Tasks / Subtasks

- [ ] Task 1: Analyze legacy order routes (AC: 1, 2, 3)
  - [ ] Subtask 1.1: Find and read legacy order routes
  - [ ] Subtask 1.2: Identify order state machine
  - [ ] Subtask 1.3: Identify invoice conversion logic
- [ ] Task 2: Implement GET /sales/orders - List with filtering (AC: 3)
  - [ ] Subtask 2.1: Accept query params: status, date_from, date_to, outlet_id
  - [ ] Subtask 2.2: Filter by company_id from auth context
  - [ ] Subtask 2.3: Return paginated order list
- [ ] Task 3: Implement POST /sales/orders - Create orders (AC: 1, 2, 3)
  - [ ] Subtask 3.1: Validate order payload with Zod
  - [ ] Subtask 3.2: Set initial order state
  - [ ] Subtask 3.3: Handle order-to-invoice conversion
- [ ] Task 4: Write comprehensive tests (AC: 4)
  - [ ] Subtask 4.1: Test order creation with state
  - [ ] Subtask 4.2: Test state transitions
  - [ ] Subtask 4.3: Test invoice conversion
  - [ ] Subtask 4.4: Test company scoping enforcement

## Dev Notes

### Technical Context

**Routes to Implement:**
- `apps/api/src/routes/sales/orders.ts` (GET /sales/orders, POST /sales/orders)
- Framework: Hono
- Complexity: MEDIUM - Order state management

**Order Data Model:**
- id, order_number, customer_id, outlet_id, company_id
- status (draft, confirmed, fulfilled, cancelled)
- total_amount, created_at, updated_at

**Order States:**
- draft → confirmed → fulfilled
- Any state can transition to cancelled

### Project Structure Notes

- Use `@/lib/db` for database access
- Route file: `apps/api/src/routes/sales/orders.ts`
- Test file: `apps/api/src/routes/sales/orders.test.ts`

### Testing Standards

- Use Node.js `test` module
- Test order state machine
- Test invoice conversion
- Test company scoping enforcement
- Ensure closeDbPool cleanup hook

## File List

- `apps/api/src/routes/sales/orders.ts` - Implement order routes
- `apps/api/src/routes/sales/orders.test.ts` - Add tests
