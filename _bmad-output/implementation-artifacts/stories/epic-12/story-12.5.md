# Story 12.5: Service Session Management

Status: done

## Story

As a cashier,
I want to manage dine-in orders for seated guests,
So that I can add items, process payments, and close tables.

## Acceptance Criteria

### AC 1: Add Order Line to Session

**Given** an occupied table with active session  
**When** POST /api/dinein/sessions/:id/lines is called  
**Then** order line is added to session working lines  
**And** SESSION_LINE_ADDED event is logged  
**And** operation is idempotent via client_tx_id

- [x] Task 1.1: Create POST /api/dinein/sessions/:id/lines route handler
- [x] Task 1.2: Validate session exists and is in ACTIVE status
- [x] Task 1.3: Validate line item data (item_id, quantity, price, notes)
- [x] Task 1.4: Add line to session working lines (checkpoint sync to POS snapshot on finalize/close)
- [x] Task 1.5: Log SESSION_LINE_ADDED event to table_events
- [x] Task 1.6: Handle idempotency via client_tx_id
- [x] Task 1.7: Return 201 with created line details
- [x] Task 1.8: Return 409 if session is not ACTIVE (e.g., LOCKED_FOR_PAYMENT)

**Request Schema:**
```typescript
{
  itemId: number,           // Required - Menu item ID
  quantity: number,         // Required - Positive integer
  unitPrice: number,        // Required - Positive number
  notes?: string,           // Optional - Special instructions
  clientTxId?: string       // Optional - For idempotency
}
```

**Response Schema (201):**
```typescript
{
  lineId: number,
  itemId: number,
  itemName: string,
  quantity: number,
  unitPrice: number,
  totalPrice: number,
  notes: string | null,
  addedAt: string,          // ISO 8601
  addedBy: string
}
```

### AC 2: Update Order Line in Session

**Given** an existing order line  
**When** PATCH /api/dinein/sessions/:id/lines/:lineId is called  
**Then** line quantity/price is updated  
**And** SESSION_LINE_UPDATED event is logged

- [x] Task 2.1: Create PATCH /api/dinein/sessions/:id/lines/:lineId route handler
- [x] Task 2.2: Validate session and line exist
- [x] Task 2.3: Validate session is in ACTIVE status (not locked)
- [x] Task 2.4: Update line in session working lines
- [x] Task 2.5: Log SESSION_LINE_UPDATED event to table_events
- [x] Task 2.6: Return updated line details
- [x] Task 2.7: Return 404 if line not found
- [x] Task 2.8: Return 409 if session is LOCKED_FOR_PAYMENT

**Request Schema:**
```typescript
{
  quantity?: number,        // Optional - Must be positive if provided
  unitPrice?: number,       // Optional - Must be positive if provided
  notes?: string            // Optional
}
```

**Response Schema:**
```typescript
{
  lineId: number,
  itemId: number,
  itemName: string,
  quantity: number,
  unitPrice: number,
  totalPrice: number,
  notes: string | null,
  updatedAt: string,        // ISO 8601
  updatedBy: string
}
```

### AC 3: Remove Order Line from Session

**Given** an existing order line  
**When** DELETE /api/dinein/sessions/:id/lines/:lineId is called  
**Then** line is removed from order  
**And** SESSION_LINE_REMOVED event is logged

- [x] Task 3.1: Create DELETE /api/dinein/sessions/:id/lines/:lineId route handler
- [x] Task 3.2: Validate session and line exist
- [x] Task 3.3: Validate session is in ACTIVE status
- [x] Task 3.4: Remove line from session working lines
- [x] Task 3.5: Log SESSION_LINE_REMOVED event to table_events
- [x] Task 3.6: Return 204 No Content on success
- [x] Task 3.7: Return 404 if line not found
- [x] Task 3.8: Return 409 if session is LOCKED_FOR_PAYMENT

### AC 4: Lock Session for Payment

**Given** guests ready to pay  
**When** POST /api/dinein/sessions/:id/lock-payment is called  
**Then** session status changes to LOCKED_FOR_PAYMENT  
**And** no further line modifications are allowed  
**And** SESSION_LOCKED event is logged

- [x] Task 4.1: Create POST /api/dinein/sessions/:id/lock-payment route handler
- [x] Task 4.2: Validate session exists and is in ACTIVE status
- [x] Task 4.3: Update session status to LOCKED_FOR_PAYMENT
- [x] Task 4.4: Log SESSION_LOCKED event to table_events
- [x] Task 4.5: Return updated session details
- [x] Task 4.6: Return 409 if session is not ACTIVE

**Response Schema:**
```typescript
{
  sessionId: number,
  tableId: number,
  status: "LOCKED_FOR_PAYMENT",
  lockedAt: string,         // ISO 8601
  lockedBy: string,
  totalAmount: number,
  lineCount: number
}
```

### AC 5: Close Session

**Given** payment completed  
**When** POST /api/dinein/sessions/:id/close is called  
**Then** session status changes to CLOSED  
**And** linked pos_order is finalized  
**And** occupancy is released (table becomes AVAILABLE)  
**And** SESSION_CLOSED event is logged

- [x] Task 5.1: Create POST /api/dinein/sessions/:id/close route handler
- [x] Task 5.2: Validate session exists (can be ACTIVE or LOCKED_FOR_PAYMENT)
- [x] Task 5.3: Update session status to CLOSED
- [x] Task 5.4: Finalize linked pos_order (set is_finalized = 1)
- [x] Task 5.5: Release table occupancy (status to AVAILABLE)
- [x] Task 5.6: Log SESSION_CLOSED event to table_events
- [x] Task 5.7: Return updated session details
- [x] Task 5.8: Perform all operations in a single transaction

**Response Schema:**
```typescript
{
  sessionId: number,
  tableId: number,
  status: "CLOSED",
  closedAt: string,         // ISO 8601
  closedBy: string,
  totalAmount: number,
  finalOrderId: string
}
```

### AC 6: Get Session Details

**Given** valid authentication and outlet access  
**When** GET /api/dinein/sessions/:id is called  
**Then** full session details are returned  
**And** includes current order lines  
**And** includes session events

- [x] Task 6.1: Create GET /api/dinein/sessions/:id route handler
- [x] Task 6.2: Validate sessionId parameter
- [x] Task 6.3: Query session with tenant isolation
- [x] Task 6.4: Fetch linked order lines
- [x] Task 6.5: Fetch recent session events from table_events
- [x] Task 6.6: Return 404 if session not found
- [x] Task 6.7: Return comprehensive session details

**Response Schema:**
```typescript
{
  sessionId: number,
  tableId: number,
  tableCode: string,
  status: "ACTIVE" | "LOCKED_FOR_PAYMENT" | "CLOSED",
  guestCount: number,
  guestName: string | null,
  startedAt: string,        // ISO 8601
  lockedAt: string | null,  // ISO 8601
  closedAt: string | null,  // ISO 8601
  totalAmount: number,
  lines: [{
    lineId: number,
    itemId: number,
    itemName: string,
    quantity: number,
    unitPrice: number,
    totalPrice: number,
    notes: string | null
  }],
  recentEvents: [{
    eventType: string,
    occurredAt: string,
    metadata: object
  }]
}
```

### AC 7: List Active Sessions

**Given** valid authentication and outlet access  
**When** GET /api/dinein/sessions is called  
**Then** list of active sessions is returned  
**And** can be filtered by status and table

- [x] Task 7.1: Create GET /api/dinein/sessions route handler
- [x] Task 7.2: Support query filters (status, tableId)
- [x] Task 7.3: Add pagination support
- [x] Task 7.4: Query sessions with tenant isolation
- [x] Task 7.5: Join with outlet_tables for table details
- [x] Task 7.6: Return paginated session list

**Response Schema:**
```typescript
{
  sessions: [{
    sessionId: number,
    tableId: number,
    tableCode: string,
    status: string,
    guestCount: number,
    guestName: string | null,
    totalAmount: number,
    lineCount: number,
    startedAt: string
  }],
  pagination: {
    total: number,
    limit: number,
    offset: number,
    hasMore: boolean
  }
}
```

## Tasks / Subtasks

### Phase 1: Library Functions
- [x] Task 1.1: Create apps/api/src/lib/service-sessions.ts
  - [x] Task 1.1.1: Define TypeScript types for ServiceSession, SessionLine, etc.
  - [x] Task 1.1.2: Implement addSessionLine() function
  - [x] Task 1.1.3: Implement updateSessionLine() function
  - [x] Task 1.1.4: Implement removeSessionLine() function
  - [x] Task 1.1.5: Implement lockSessionForPayment() function
  - [x] Task 1.1.6: Implement closeSession() function
  - [x] Task 1.1.7: Implement getSession() function
  - [x] Task 1.1.8: Implement listSessions() function

### Phase 2: Line Management Endpoints (AC 1-3)
- [x] Task 2.1: Create POST /api/dinein/sessions/:id/lines endpoint
  - [x] Task 2.1.1: Set up route with auth guards
  - [x] Task 2.1.2: Implement request validation
  - [x] Task 2.1.3: Handle idempotency with client_tx_id
  - [x] Task 2.1.4: Return proper response
- [x] Task 2.2: Create PATCH /api/dinein/sessions/:id/lines/:lineId endpoint
  - [x] Task 2.2.1: Set up route with auth guards
  - [x] Task 2.2.2: Implement request validation
  - [x] Task 2.2.3: Handle status checks (ACTIVE only)
- [x] Task 2.3: Create DELETE /api/dinein/sessions/:id/lines/:lineId endpoint
  - [x] Task 2.3.1: Set up route with auth guards
  - [x] Task 2.3.2: Implement status checks
  - [x] Task 2.3.3: Handle 404 cases

### Phase 3: Session Control Endpoints (AC 4-5)
- [x] Task 3.1: Create POST /api/dinein/sessions/:id/lock-payment endpoint
  - [x] Task 3.1.1: Set up route with auth guards
  - [x] Task 3.1.2: Implement status transition validation
  - [x] Task 3.1.3: Log SESSION_LOCKED event
- [x] Task 3.2: Create POST /api/dinein/sessions/:id/close endpoint
  - [x] Task 3.2.1: Set up route with auth guards
  - [x] Task 3.2.2: Implement transaction wrapper for atomic operations
  - [x] Task 3.2.3: Finalize pos_order
  - [x] Task 3.2.4: Release table occupancy
  - [x] Task 3.2.5: Log SESSION_CLOSED event

### Phase 4: Query Endpoints (AC 6-7)
- [x] Task 4.1: Create GET /api/dinein/sessions/:id endpoint
  - [x] Task 4.1.1: Set up route with auth guards
  - [x] Task 4.1.2: Fetch session with lines and events
  - [x] Task 4.1.3: Handle 404 cases
- [x] Task 4.2: Create GET /api/dinein/sessions endpoint
  - [x] Task 4.2.1: Set up route with auth guards
  - [x] Task 4.2.2: Implement filtering and pagination
  - [x] Task 4.2.3: Return proper response format

### Phase 5: Tests
- [x] Task 5.1: Write unit tests for library functions
  - [x] Task 5.1.1: Test addSessionLine with idempotency
  - [x] Task 5.1.2: Test updateSessionLine
  - [x] Task 5.1.3: Test removeSessionLine
  - [x] Task 5.1.4: Test lockSessionForPayment
  - [x] Task 5.1.5: Test closeSession
- [x] Task 5.2: Write integration tests for endpoints
  - [x] Task 5.2.1: Test POST /sessions/:id/lines
  - [x] Task 5.2.2: Test PATCH /sessions/:id/lines/:lineId
  - [x] Task 5.2.3: Test DELETE /sessions/:id/lines/:lineId
  - [x] Task 5.2.4: Test POST /sessions/:id/lock-payment
  - [x] Task 5.2.5: Test POST /sessions/:id/close
  - [x] Task 5.2.6: Test full session lifecycle

## Dev Notes

### Dependencies on Previous Stories
- **Story 12.1 (Database Schema)**: Uses table_service_sessions, table_events tables
- **Story 12.2 (Shared Constants)**: Uses ServiceSessionStatus, TableEventType constants
- **Story 12.3 (Table Occupancy)**: Must integrate with occupancy release on close
- **Story 12.4 (Reservation Management)**: Sessions may be linked to reservations

### Key Technical Requirements

#### 1. Idempotency via client_tx_id
All mutation operations must support idempotency:
- Check table_events for existing client_tx_id
- If found, return cached result instead of re-executing
- Prevents duplicate lines on network retries

#### 2. Status Machine Enforcement
```
ACTIVE → LOCKED_FOR_PAYMENT → CLOSED
  ↓
CANCELLED (not in this story - via reservation cancel)
```
- Lines can only be modified in ACTIVE status
- Lock prevents modifications during payment
- Close finalizes everything

#### 3. Transaction Boundaries
Critical operations must be atomic:
- **closeSession**: Update session + finalize order + release occupancy + log event
- **addSessionLine**: Insert line + log event (within same transaction)

#### 4. Event Logging
All operations must log to table_events:
- SESSION_LINE_ADDED
- SESSION_LINE_UPDATED
- SESSION_LINE_REMOVED
- SESSION_LOCKED
- SESSION_CLOSED

### Database Schema Reference

**table_service_sessions:**
```sql
id: BIGINT PK
company_id: BIGINT FK
outlet_id: BIGINT FK
table_id: BIGINT FK
status_id: TINYINT (1=ACTIVE, 2=LOCKED_FOR_PAYMENT, 3=CLOSED)
guest_count: INT
guest_name: VARCHAR(100)
linked_order_id: VARCHAR(36) -- References pos_order_snapshots
started_at: TIMESTAMP
locked_at: TIMESTAMP NULL
closed_at: TIMESTAMP NULL
created_by: VARCHAR(100)
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

**table_events:**
```sql
event_id: BIGINT PK AUTO_INCREMENT
company_id: BIGINT
outlet_id: BIGINT
table_id: BIGINT
event_type_id: TINYINT
session_id: BIGINT NULL
reservation_id: BIGINT NULL
client_tx_id: VARCHAR(64) -- For idempotency
metadata: JSON
occurred_at: TIMESTAMP
created_by: VARCHAR(100)
-- Unique constraint: (company_id, outlet_id, client_tx_id)
```

### Project Structure Notes

**Files to Create:**
- `apps/api/app/api/dinein/sessions/route.ts` - GET list sessions
- `apps/api/app/api/dinein/sessions/[sessionId]/route.ts` - GET single session
- `apps/api/app/api/dinein/sessions/[sessionId]/lines/route.ts` - POST add line
- `apps/api/app/api/dinein/sessions/[sessionId]/lines/[lineId]/route.ts` - PATCH/DELETE line
- `apps/api/app/api/dinein/sessions/[sessionId]/lock-payment/route.ts` - POST lock
- `apps/api/app/api/dinein/sessions/[sessionId]/close/route.ts` - POST close
- `apps/api/src/lib/service-sessions.ts` - Core business logic
- `apps/api/src/lib/service-sessions.test.ts` - Unit tests
- `apps/api/app/api/dinein/sessions/route.test.ts` - Integration tests

**Key Patterns from Story 12.3/12.4:**

1. **Route Structure:**
   ```typescript
   export const POST = withAuth(async (request, auth) => {
     // Validate input
     // Call library function
     // Return successResponse()
   }, [requireAccess({ roles: [...], module: "pos", permission: "update" })])
   ```

2. **Idempotency Pattern:**
   ```typescript
   // Check for existing event
   const existingEvent = await checkExistingEvent(clientTxId, companyId, outletId);
   if (existingEvent) {
     return existingEvent.result; // Return cached result
   }
   // Execute and log
   const result = await executeOperation();
   await logEvent({ clientTxId, result });
   return result;
   ```

3. **Transaction Pattern:**
   ```typescript
   const connection = await pool.getConnection();
   try {
     await connection.beginTransaction();
     // Multiple operations
     await connection.commit();
   } catch (error) {
     await connection.rollback();
     throw error;
   } finally {
     connection.release();
   }
   ```

### Error Handling

- **400**: Invalid input, validation errors
- **401**: Not authenticated
- **403**: Not authorized (wrong role/permission)
- **404**: Session or line not found
- **409**: Invalid status transition, session not ACTIVE
- **500**: Unexpected errors

### Testing Fixture Policy

- Use Story 12.4's reservation endpoints to create test fixtures
- Create sessions via table occupancy seat operation (Story 12.3)
- API-driven setup for all business entities
- Direct DB only for cleanup in finally blocks

### References

- **Epic 12**: `_bmad-output/planning-artifacts/epics-split/epic-12-table-reservation-pos-sync.md`
- **Architecture**: `_bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md`
- **Story 12.3**: `_bmad-output/implementation-artifacts/stories/epic-12/story-12.3.md`
- **Story 12.4**: `_bmad-output/implementation-artifacts/stories/epic-12/story-12.4.md`
- **Shared Constants**: `packages/shared/src/constants/table-states.ts`
- **Table Occupancy Library**: `apps/api/src/lib/table-occupancy.ts`
- **Reservation Library**: `apps/api/src/lib/reservations.ts`

## Dev Agent Record

### Agent Model Used

- Chunk A (Contracts): bmad-quick-dev (minimax-m2.5)
- Chunk B (Library Foundation): bmad-quick-flow-solo-dev (minimax-m2.5)
- Chunk C (Line Mutations): bmad-quick-flow-solo-dev (minimax-m2.5)
- Chunk D (Session Control): bmad-quick-dev (minimax-m2.5)
- Chunk E (Mutation Routes): bmad-quick-dev (minimax-m2.5)
- Chunk F (Query Routes): bmad-quick-dev (minimax-m2.5)
- Chunk G (Tests): bmad-qa (minimax-m2.5)
- Chunk H (Review): bmad-code-review (kimi-k2.5)

### Debug Log References

- Initial implementation: Narrow-scope decomposition into 8 parallel chunks
- Review cycle 1: 6 HIGH, 3 MEDIUM, 1 LOW issues identified
- Review cycle 2: All HIGH issues resolved, story approved with 2 open MEDIUM/LOW items

### Completion Notes List

**2026-03-19 - Implementation Complete**

All acceptance criteria implemented:
- AC1: POST /sessions/:id/lines - Add order line with idempotency ✓
- AC2: PATCH /sessions/:id/lines/:lineId - Update line ✓
- AC3: DELETE /sessions/:id/lines/:lineId - Remove line (204 response) ✓
- AC4: POST /sessions/:id/lock-payment - Lock for payment ✓
- AC5: POST /sessions/:id/close - Close session with atomic transaction ✓
- AC6: GET /sessions/:id - Get session with lines and events ✓
- AC7: GET /sessions - List sessions with filters ✓

**Key Technical Decisions:**
1. **Idempotency**: Scoped to (company_id, outlet_id, client_tx_id) for tenant isolation
2. **Status Machine**: ACTIVE(1) → LOCKED_FOR_PAYMENT(2) → CLOSED(3)
3. **Transaction Safety**: closeSession uses single DB transaction for session + order + occupancy
4. **Event Logging**: All mutations append to table_events for audit trail
5. **Money Handling**: DECIMAL(15,4) for all monetary values, positive validation

**Files Created/Modified:**
- 9 new source files (routes + library)
- 8 modified files (table-occupancy.ts, constants, schemas, docs, ADR)
- 5 database migrations (0104-0108)
- 2 test files (20 unit tests + 10 integration tests)

**Performance Notes:**
- List query uses N+1 pattern for lines; acceptable for current scale
- All mutations use transactions with proper rollback on error
- Event logging is append-only (no cleanup possible)

**Integration Points:**
- Story 12.3: Uses seatTable for session creation, releaseTable for close
- Story 12.4: Reservations can link to sessions via reservation_id
- POS Orders: Lines stored in table_service_session_lines (not pos_order_snapshots directly)

### File List

**Files Created:**
- [x] `apps/api/app/api/dinein/sessions/route.ts` - GET list sessions with pagination
- [x] `apps/api/app/api/dinein/sessions/[sessionId]/route.ts` - GET single session with lines and events
- [x] `apps/api/app/api/dinein/sessions/[sessionId]/lines/route.ts` - POST add line with idempotency
- [x] `apps/api/app/api/dinein/sessions/[sessionId]/lines/[lineId]/route.ts` - PATCH/DELETE line
- [x] `apps/api/app/api/dinein/sessions/[sessionId]/lock-payment/route.ts` - POST lock session
- [x] `apps/api/app/api/dinein/sessions/[sessionId]/close/route.ts` - POST close session
- [x] `apps/api/app/api/dinein/sessions/[sessionId]/finalize-batch/route.ts` - POST finalize checkpoint batch
- [x] `apps/api/app/api/dinein/sessions/[sessionId]/lines/[lineId]/adjust/route.ts` - POST line adjustment (cancel/reduce with reason)
- [x] `apps/api/src/lib/service-sessions.ts` - Core business logic with transactions
- [x] `apps/api/src/lib/service-sessions.test.ts` - Unit tests (22 tests)
- [x] `apps/api/app/api/dinein/sessions/route.test.ts` - Integration tests (extended with finalize-batch and adjust flows)

**Files Modified:**
- [x] `apps/api/src/lib/table-occupancy.ts` - Fixed releaseTable to use CLOSED status (3) instead of COMPLETED (2)
- [x] `packages/shared/src/constants/table-states.ts` - Added ServiceSessionStatus constants (ACTIVE=1, LOCKED_FOR_PAYMENT=2, CLOSED=3)
- [x] `packages/shared/src/schemas/table-reservation.ts` - Added FinalizeSessionBatchRequestSchema, FinalizeSessionBatchResponseSchema, AdjustSessionLineRequestSchema
- [x] `docs/API.md` - Added Dine-in Service Sessions section with finalize-batch and adjust endpoints
- [x] `docs/ARCHITECTURE.md` - Added checkpoint flow diagram and invariants
- [x] `docs/db/schema.md` - Documented checkpoint columns/tables and precision notes
- [x] `docs/adr/ADR-0010-dinein-finalize-checkpoints.md` - Decision record for checkpoint model
- [x] `docs/project-context.md` - Updated integration fixture policy notes and review guidance

**Out-of-Scope Workspace Changes (Present in Git but Not Owned by This Story):**
- `apps/api/src/routes/stock.test.ts` - Pre-existing test file with unrelated fixture cleanup issues

**Database Migrations Created:**
- [x] `packages/db/migrations/0104_story_12_5_session_management_contract.sql` - Updated CHECK constraints for new event types and session statuses
- [x] `packages/db/migrations/0105_story_12_5_add_session_columns_and_lines_table.sql` - Added columns (locked_at, closed_at, pos_order_snapshot_id, reservation_id) and table_service_session_lines table
- [x] `packages/db/migrations/0106_story_12_5_fix_session_lifecycle_trigger.sql` - Fixed INSERT trigger to allow all valid statuses
- [x] `packages/db/migrations/0107_story_12_5_fix_session_update_trigger.sql` - Fixed UPDATE trigger for status transitions (1→2, 1→3, 2→3)
- [x] `packages/db/migrations/0108_story_12_5_finalize_checkpoints.sql` - Added checkpoint columns/table, line states, and event range extension

## Senior Developer Review (AI)

- Reviewer: BMAD Code Review Agent
- Date: 2026-03-19
- Outcome: READY FOR REVIEW
- Summary: CRITICAL/HIGH follow-ups have been implemented: close-time snapshot linkage hardening, duplicate-item-safe snapshot sync, PATCH/DELETE idempotency short-circuits, checkpoint finalize and adjust endpoints, and integration coverage updates.

### Action Items

#### Review Follow-ups (AI)
- [x] [AI-Review][HIGH] Make `addSessionLine` duplicate replay deterministic by linking replay to the original event/line, not latest session line (`apps/api/src/lib/service-sessions.ts:791`)
- [x] [AI-Review][MEDIUM] Refactor integration fixtures to API-driven setup for business entities; keep direct DB writes only for teardown/read-only checks (`apps/api/app/api/dinein/sessions/route.test.ts:108`)
- [x] [AI-Review][MEDIUM] Add missing changed file `docs/project-context.md` to story File List for traceability (`_bmad-output/implementation-artifacts/stories/epic-12/story-12.5.md:527`)
- [ ] [AI-Review][LOW] Optimize `listSessions` N+1 session-line fetch for larger outlets (`apps/api/src/lib/service-sessions.ts:440`)

#### [AI-Review] Resolved (All HIGH Priority)
- [x] **Tenant-scoped idempotency**: Fixed `checkClientTxIdExists` to include `company_id` and `outlet_id` in query (`apps/api/src/lib/service-sessions.ts:678`)
- [x] **Cross-story status regression**: Fixed `releaseTable` to use status 3 (CLOSED) instead of 2 (`apps/api/src/lib/table-occupancy.ts:532`)
- [x] **AC6 recentEvents**: Implemented `getSessionEvents` and integrated into GET /sessions/:id response (`apps/api/app/api/dinein/sessions/[sessionId]/route.ts:60`)
- [x] **AC3 204 response**: DELETE line now returns 204 No Content (`apps/api/app/api/dinein/sessions/[sessionId]/lines/[lineId]/route.ts:167`)
- [x] **Money validation**: Added `.positive()` validation to unitPrice schemas (`apps/api/app/api/dinein/sessions/[sessionId]/lines/route.ts:48`)
- [x] **Migration portability**: Added MySQL/MariaDB guard for DROP CHECK vs DROP CONSTRAINT (`packages/db/migrations/0104_story_12_5_session_management_contract.sql:33`)

#### [AI-Review] Resolved (Code Review Cycle 2 - Fixed by Tasks A-H)
- [x] [AI-Review][CRITICAL] AC1 Task 1.7 mismatch: `POST /sessions/:id/lines` now returns `201` (`apps/api/app/api/dinein/sessions/[sessionId]/lines/route.ts:100`)
- [x] [AI-Review][HIGH] Session lines now synced to POS order at close time via `pos_order_snapshot_lines` (`apps/api/src/lib/service-sessions.ts:1395`)
- [x] [AI-Review][HIGH] `posOrderSnapshotId` persisted in lock and consumed in close (`apps/api/src/lib/service-sessions.ts:1245`, `apps/api/src/lib/service-sessions.ts:1340`)
- [x] [AI-Review][HIGH] Tenant scoping enforced for productId validation (`apps/api/src/lib/service-sessions.ts:785`)
- [x] [AI-Review][HIGH] Client-provided idempotency keys implemented for PATCH/DELETE (`apps/api/app/api/dinein/sessions/[sessionId]/lines/[lineId]/route.ts:49`, `apps/api/app/api/dinein/sessions/[sessionId]/lines/[lineId]/route.ts:55`)
- [x] [AI-Review][HIGH] Integration test updated for DELETE 204 contract (`apps/api/app/api/dinein/sessions/route.test.ts:291`)

#### [AI-Review] Follow-ups Implemented (Current Pass)
- [x] [AI-Review][CRITICAL] Reconciled line-to-POS linkage to checkpoint/close sync model (working lines + finalize checkpoints)
- [x] [AI-Review][CRITICAL] Implemented duplicate-item-safe snapshot sync by aggregated insert per `product_id`
- [x] [AI-Review][CRITICAL] Enforced close to consume persisted snapshot link; removed caller override on close route
- [x] [AI-Review][HIGH] Added PATCH idempotency short-circuit in service layer
- [x] [AI-Review][HIGH] Added DELETE idempotency short-circuit in service layer
- [x] [AI-Review][HIGH] Added snapshot finalization affected-row validation in close flow
- [x] [AI-Review][MEDIUM] Applied explicit 2dp rounding policy when syncing to `pos_order_snapshot_lines`
- [x] [AI-Review][MEDIUM] Updated story status/review narrative consistency
- [x] [AI-Review][LOW] Aligned close route wording to CLOSED lifecycle terminology

#### Deferred (Non-blocking)
- [ ] [AI-Review][LOW] Optimize `listSessions` N+1 line fetch for larger outlets (`apps/api/src/lib/service-sessions.ts`)

### Test Results (Current)
```
# tests 404
# suites 76
# pass 403
# fail 0
# cancelled 0
# skipped 1
# duration_ms ~26000
```

**Note:** Integration coverage now includes finalize-batch and line adjustment flows.

### Validation Gates
- [x] TypeScript: PASS
- [x] Build: PASS
- [x] Lint: PASS
- [x] Unit Tests: PASS (403/404, 1 skip)

### Completion Evidence
- Implemented new endpoints: finalize-batch and adjust line
- Added migration 0108 for checkpoint state model and event range extension
- Hardened close session lifecycle and snapshot finalization checks
- Added service-layer idempotency short-circuits for PATCH/DELETE line operations
- Updated integration tests for finalize-batch, adjust, and persisted snapshot close flow

## Change Log

## Story Context Summary

**What This Story Is:**
Implement the Service Session Management API that enables cashiers to manage dine-in orders for seated guests. This includes adding/updating/removing order lines, locking sessions for payment, and closing sessions to finalize orders and release tables.

**Why It Matters:**
- Enables complete dine-in order lifecycle from seating to payment
- Integrates with POS order system for seamless billing
- Supports multi-cashier operations with proper locking
- Provides audit trail via event logging
- Foundation for Table Board UI (Story 12.7) visual order management

**Key Technical Decisions:**
1. **Idempotency**: client_tx_id prevents duplicate operations on network retries
2. **Status Machine**: ACTIVE → LOCKED_FOR_PAYMENT → CLOSED prevents race conditions
3. **Event Logging**: All mutations logged to table_events for audit and sync
4. **Transaction Safety**: Close operation is atomic (session + order + occupancy)
5. **API-Driven Tests**: Use existing 12.3/12.4 endpoints for fixture setup

**Success Criteria:**
- Session management endpoints implemented and tested, including finalize-batch and line adjustment flows
- Idempotency works correctly with client_tx_id
- Status transitions are enforced
- Event logging captures all mutations
- Transactions ensure data consistency
- Unit and integration tests passing

**Implementation Notes:**
- Sessions are created by Story 12.3's seat operation - this story manages them
- Must integrate with pos_order_snapshots for actual order data
- Table release on close uses Story 12.3's occupancy functions
- Events support Story 12.6's sync infrastructure

**Dependencies:**
- **Prerequisites:**
  - Story 12.1: Database migrations applied ✅
  - Story 12.2: Shared constants and schemas ✅
  - Story 12.3: Table occupancy and session creation ✅
  - Story 12.4: Reservation management (optional) ✅
- **Provides for:**
  - Story 12.6: Sync operations have session events to sync
  - Story 12.7: Table Board UI shows session details

---

**Previous Story:** Story 12.4 (Reservation Management API) - provides reservation context for sessions
**Next Story:** Story 12.6 (POS Sync for Table Operations) - syncs session events across devices
