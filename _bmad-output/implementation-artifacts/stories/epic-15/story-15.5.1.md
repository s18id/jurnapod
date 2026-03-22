# Story 15.5.1: Dine-In Routes

Status: ready-for-dev

## Story

As a restaurant POS user,
I want to manage tables and sessions via dine-in endpoints,
so that I can track table occupancy, orders, and payments for restaurant operations.

## User Story

As a restaurant operator,
I want to manage table states and session lifecycles,
so that I can efficiently handle dine-in customers from seating to payment.

## Acceptance Criteria

1. **AC-1:** Table states managed correctly (available, occupied, reserved, cleaning)
2. **AC-2:** Session lifecycle enforced (open → ordering → payment → closed)
3. **AC-3:** Integration with sales orders works
4. **AC-4:** All tests pass

## Tasks / Subtasks

- [ ] Task 1: Analyze dine-in workflow (AC: 1, 2, 3)
  - [ ] Subtask 1.1: Find and read legacy dine-in routes
  - [ ] Subtask 1.2: Identify table state management
  - [ ] Subtask 1.3: Identify session lifecycle logic
- [ ] Task 2: Implement table management (AC: 1)
  - [ ] Subtask 2.1: GET /dine-in/tables - List all tables
  - [ ] Subtask 2.2: GET /dine-in/tables/:id - Single table details
  - [ ] Subtask 2.3: PUT /dine-in/tables/:id/status - Update table state
- [ ] Task 3: Implement session management (AC: 2)
  - [ ] Subtask 3.1: POST /dine-in/sessions - Open new session (assign table)
  - [ ] Subtask 3.2: PUT /dine-in/sessions/:id/state - Transition session state
  - [ ] Subtask 3.3: GET /dine-in/sessions/:id - Get session details
- [ ] Task 4: Integrate with sales orders (AC: 3)
  - [ ] Subtask 4.1: Link sessions to sales orders
  - [ ] Subtask 4.2: Track orders per session
- [ ] Task 5: Write comprehensive tests (AC: 4)
  - [ ] Subtask 5.1: Test table state transitions
  - [ ] Subtask 5.2: Test session lifecycle
  - [ ] Subtask 5.3: Test sales order integration

## Dev Notes

### Technical Context

**Routes to Implement:**
- `apps/api/src/routes/dine-in/tables.ts` - Table management
- `apps/api/src/routes/dine-in/sessions.ts` - Session management
- Framework: Hono
- Complexity: MEDIUM - State machine, workflow

**Table Data Model:**
- id, table_number, outlet_id, company_id
- capacity, status (available, occupied, reserved, cleaning)
- current_session_id (nullable)

**Session Data Model:**
- id, table_id, outlet_id, company_id
- state (open, ordering, payment, closed)
- guest_count, opened_at, closed_at
- total_amount

### Project Structure Notes

- Use `@/lib/db` for database access
- Route files: `apps/api/src/routes/dine-in/tables.ts`, `apps/api/src/routes/dine-in/sessions.ts`
- Test files: `apps/api/src/routes/dine-in/tables.test.ts`, `apps/api/src/routes/dine-in/sessions.test.ts`

### Testing Standards

- Use Node.js `test` module
- Test table state machine
- Test session lifecycle transitions
- Test invalid state transitions (should reject)
- Ensure closeDbPool cleanup hook

## File List

- `apps/api/src/routes/dine-in/tables.ts` - Table management
- `apps/api/src/routes/dine-in/sessions.ts` - Session management
- `apps/api/src/routes/dine-in/tables.test.ts` - Table tests
- `apps/api/src/routes/dine-in/sessions.test.ts` - Session tests
