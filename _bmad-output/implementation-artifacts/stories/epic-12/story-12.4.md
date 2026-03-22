# Story 12.4: Reservation Management API

Status: done

## Story

As a backoffice user,
I want to create and manage table reservations,
So that customers can book tables in advance.

## Acceptance Criteria

### AC 1: List Reservations Endpoint

**Given** valid authentication and outlet access  
**When** GET /api/dinein/reservations is called  
**Then** it returns paginated list of reservations  
**And** results can be filtered by status, table, customer name, or date range  
**And** response includes reservation details with linked table info

- [x] Task 1.1: Create GET /api/dinein/reservations route handler
- [x] Task 1.2: Implement tenant isolation (company_id, outlet_id scoping)
- [x] Task 1.3: Add pagination support (limit, offset, cursor)
- [x] Task 1.4: Implement filters: status_id, table_id, customer_name, date_range
- [x] Task 1.5: Query reservations table with optional joins
- [x] Task 1.6: Return response with reservation array and pagination metadata
- [x] Task 1.7: Add role-based access control (OWNER, ADMIN, CASHIER)

**Response Schema:**
```typescript
{
  reservations: [{
    id: number,
    reservationCode: string,
    statusId: number, // 1=PENDING, 2=CONFIRMED, 3=CHECKED_IN, 4=NO_SHOW, 5=CANCELLED, 6=COMPLETED
    partySize: number,
    customerName: string,
    customerPhone: string | null,
    customerEmail: string | null,
    reservationTime: string, // ISO 8601 datetime
    durationMinutes: number,
    tableId: number | null,
    tableCode: string | null,
    notes: string | null,
    createdAt: string,
    updatedAt: string
  }],
  pagination: {
    total: number,
    limit: number,
    offset: number,
    hasMore: boolean
  }
}
```

### AC 2: Get Single Reservation Endpoint

**Given** valid authentication and outlet access  
**When** GET /api/dinein/reservations/:id is called  
**Then** it returns detailed reservation information  
**And** includes full customer details and table assignment

- [x] Task 2.1: Create GET /api/dinein/reservations/:id route handler
- [x] Task 2.2: Validate reservationId parameter (Zod)
- [x] Task 2.3: Query reservation by ID with tenant scoping
- [x] Task 2.4: Return 404 if reservation not found
- [x] Task 2.5: Return detailed reservation response

**Response Schema:**
```typescript
{
  id: number,
  reservationCode: string,
  statusId: number,
  partySize: number,
  customerName: string,
  customerPhone: string | null,
  customerEmail: string | null,
  reservationTime: string,
  durationMinutes: number,
  tableId: number | null,
  tableCode: string | null,
  tableName: string | null,
  notes: string | null,
  cancellationReason: string | null,
  createdAt: string,
  updatedAt: string,
  createdBy: string,
  updatedBy: string | null
}
```

### AC 3: Create Reservation Endpoint

**Given** valid reservation details  
**When** POST /api/dinein/reservations is called  
**Then** reservation is created with PENDING status  
**And** reservation_code is generated unique per outlet  
**And** no table is held until confirmed

- [x] Task 3.1: Create POST /api/dinein/reservations route handler
- [x] Task 3.2: Validate request body with Zod schema
- [x] Task 3.3: Generate unique reservation_code per outlet (format: RES-XXX)
- [x] Task 3.4: Set default status_id to PENDING (1)
- [x] Task 3.5: Insert record into reservations table
- [x] Task 3.6: Return 201 with created reservation details
- [x] Task 3.7: Handle validation errors (400)
- [x] Task 3.8: Handle duplicate code generation retry

**Request Schema:**
```typescript
{
  partySize: number, // Required, positive integer
  customerName: string, // Required
  customerPhone?: string,
  customerEmail?: string,
  reservationTime: string, // ISO 8601 datetime
  durationMinutes: number, // Default: 90
  tableId?: number, // Optional - can be assigned later
  notes?: string
}
```

**Response Schema:**
```typescript
{
  id: number,
  reservationCode: string,
  statusId: number, // 1=PENDING
  partySize: number,
  customerName: string,
  reservationTime: string,
  message: "Reservation created successfully"
}
```

### AC 4: Update Reservation Status Endpoint

**Given** an existing reservation  
**When** PATCH /api/dinein/reservations/:id is called with status update  
**Then** reservation status is updated  
**And** appropriate side effects occur (hold table, release table, create session)

- [x] Task 4.1: Create PATCH /api/dinein/reservations/:id route handler
- [x] Task 4.2: Validate reservationId parameter
- [x] Task 4.3: Validate status transition (cannot skip states)
- [x] Task 4.4: Handle CONFIRMED status: hold table via holdTable()
- [x] Task 4.5: Handle CHECKED_IN status: seat table via seatTable()
- [x] Task 4.6: Handle CANCELLED status: release held table, record reason
- [x] Task 4.7: Handle NO_SHOW status: auto-cancel after grace period
- [x] Task 4.8: Update reservations table with new status
- [x] Task 4.9: Return updated reservation details
- [x] Task 4.10: Return 400 for invalid status transitions
- [x] Task 4.11: Return 404 if reservation not found

**Request Schema:**
```typescript
{
  statusId: number, // Target status: 2=CONFIRMED, 3=CHECKED_IN, 4=NO_SHOW, 5=CANCELLED
  tableId?: number, // Required when confirming (if not already set)
  cancellationReason?: string, // Required when cancelling
  notes?: string
}
```

**Status Transitions:**
- PENDING (1) → CONFIRMED (2): Hold table, set held_until
- PENDING (1) → CANCELLED (5): Record cancellation reason
- CONFIRMED (2) → CHECKED_IN (3): Seat guests, create service session
- CONFIRMED (2) → NO_SHOW (4): Release table after grace period
- CONFIRMED (2) → CANCELLED (5): Release table, record reason
- CHECKED_IN (3) → COMPLETED (6): Finalize after session closed

### AC 5: Input Validation & Error Handling

**Given** invalid requests  
**When** endpoints receive malformed data  
**Then** appropriate error responses are returned  
**And** all inputs are validated with Zod schemas

- [x] Task 5.1: Validate all path parameters (reservationId as positive integer)
- [x] Task 5.2: Validate all request bodies with Zod schemas
- [x] Task 5.3: Validate date formats (ISO 8601)
- [x] Task 5.4: Validate phone number format (if provided)
- [x] Task 5.5: Validate email format (if provided)
- [x] Task 5.6: Return 400 for validation errors with field-level details
- [x] Task 5.7: Return 401 for authentication failures
- [x] Task 5.8: Return 403 for authorization failures
- [x] Task 5.9: Return 404 for non-existent reservations
- [x] Task 5.10: Return 409 for conflicting reservations (same table/time)
- [x] Task 5.11: Return 500 for unexpected errors

### AC 6: Reservation Code Generation

**Given** a new reservation being created  
**When** reservation is inserted into database  
**Then** a unique reservation_code is generated  
**And** code is unique per outlet  
**And** code format is human-readable

- [x] Task 6.1: Implement generateReservationCode() helper
- [x] Task 6.2: Format: RES-{outletId}-{timestamp}-{random} or similar
- [x] Task 6.3: Ensure uniqueness via database constraint
- [x] Task 6.4: Handle collision with retry logic

## Tasks / Subtasks

### Phase 1: List & Get Endpoints (AC 1-2)
- [x] Task 1.1: Create GET /api/dinein/reservations route
  - [x] Task 1.1.1: Set up route file with auth guards
  - [x] Task 1.1.2: Implement query builder with filters
  - [x] Task 1.1.3: Add pagination logic
- [x] Task 1.2: Create GET /api/dinein/reservations/:id route
  - [x] Task 1.2.1: Set up route with parameter validation
  - [x] Task 1.2.2: Implement single reservation query

### Phase 2: Create Endpoint (AC 3)
- [x] Task 2.1: Create POST /api/dinein/reservations route
  - [x] Task 2.1.1: Define Zod schema for request body
  - [x] Task 2.1.2: Implement code generation logic
  - [x] Task 2.1.3: Insert reservation record
  - [x] Task 2.1.4: Return 201 response

### Phase 3: Update/Status Endpoint (AC 4)
- [x] Task 3.1: Create PATCH /api/dinein/reservations/:id route
  - [x] Task 3.1.1: Define Zod schema for status updates
  - [x] Task 3.1.2: Implement status transition validation
  - [x] Task 3.1.3: Integrate with table-occupancy library for CONFIRMED/CHECKED_IN
  - [x] Task 3.1.4: Handle CANCELLED with table release
  - [x] Task 3.1.5: Update reservation record

### Phase 4: Library Functions
- [x] Task 4.1: Create reservations library file
  - [x] Task 4.1.1: Define TypeScript types for Reservation
  - [x] Task 4.1.2: Implement createReservation() function
  - [x] Task 4.1.3: Implement getReservation() function
  - [x] Task 4.1.4: Implement listReservations() function
  - [x] Task 4.1.5: Implement updateReservationStatus() function
  - [x] Task 4.1.6: Implement generateReservationCode() helper

### Phase 5: Tests
- [x] Task 5.1: Write unit tests for library functions (added by Chunk A)
  - [x] Task 5.1.1: Test createReservationV2
  - [x] Task 5.1.2: Test status transitions
  - [x] Task 5.1.3: Test code generation
- [x] Task 5.2: Write integration tests for endpoints (added by Chunk A)
  - [x] Task 5.2.1: Test GET /reservations with filters
  - [x] Task 5.2.2: Test POST /reservations
  - [x] Task 5.2.3: Test PATCH /reservations/:id

### Review Follow-ups (AI) — 2026-03-19

- [x] [AI-Review][CRITICAL] Add Story 12.4-specific tests for the new V2 contract and route endpoints; current checkboxes claim test completion without concrete reservation route coverage. [apps/api/src/lib/reservations.test.ts:10]
- [x] [AI-Review][HIGH] Include linked table info in list response (remove `tableCode: null` TODO by joining table metadata). [apps/api/app/api/dinein/reservations/route.ts:84]
- [x] [AI-Review][HIGH] Fix list filter SQL parameter alignment; current status/date condition rewriting risks incorrect filtering/param mismatch. [apps/api/src/lib/reservations.ts:975]
- [x] [AI-Review][HIGH] Enforce reservation overlap/conflict detection for same table/time and return 409. [apps/api/src/lib/reservations.ts:788]
- [x] [AI-Review][HIGH] Implement CHECKED_IN side effect to seat table/create session per AC4 (currently validation-only). [apps/api/src/lib/reservations.ts:1097]
- [x] [AI-Review][HIGH] Implement NO_SHOW grace-period enforcement before status transition. [apps/api/src/lib/reservations.ts:1023]
- [x] [AI-Review][MEDIUM] Reconcile story route structure docs with canonical REST implementation (remove stale `create/` and `status/` route references). [_bmad-output/implementation-artifacts/stories/epic-12/story-12.4.md:264]
- [x] [AI-Review][MEDIUM] Reconcile story status and git tracking once fixes are complete (story currently marked review while blockers remain). [_bmad-output/implementation-artifacts/sprint-status.yaml:145]

## Dev Notes

### Dependencies on Previous Stories
- **Story 12.3 (Table Occupancy API)**: Must integrate with `holdTable()` and `seatTable()` functions
- **Story 12.2 (Shared Constants)**: Use `ReservationStatus` constants from `@jurnapod/shared`
- **Story 12.1 (Database Schema)**: Uses `reservations` table from migrations

### Project Structure Notes

**Files Created (Canonical REST Implementation):**
- `apps/api/app/api/dinein/reservations/route.ts` - GET list + POST create handler
- `apps/api/app/api/dinein/reservations/[reservationId]/route.ts` - GET single + PATCH update handler
- `apps/api/src/lib/reservations.ts` - Database helper functions
- `apps/api/src/lib/reservations.test.ts` - Unit tests

**Key Patterns from Story 12.3:**

1. **Route Structure Pattern:**
   ```typescript
   // File: apps/api/app/api/dinein/reservations/route.ts
   export const GET = withAuth(async (request, auth) => {
     // Extract outletId from query
     // Parse filter params
     // Call library function
     // Return successResponse()
   }, [requireAccess({ roles: [...], module: "pos", permission: "read" })])
   ```

2. **Library Function Pattern:**
   ```typescript
   // File: apps/api/src/lib/reservations.ts
   export async function createReservation(input: CreateReservationInput): Promise<Reservation> {
     const pool = getDbPool();
     // Generate code
     // Insert record
     // Return reservation
   }
   ```

3. **Zod Validation Pattern:**
   ```typescript
   const CreateReservationSchema = z.object({
     partySize: z.number().int().min(1),
     customerName: z.string().min(1).max(100),
     customerPhone: z.string().optional(),
     customerEmail: z.string().email().optional(),
     reservationTime: z.string().datetime(),
     durationMinutes: z.number().int().min(15).default(90),
     tableId: NumericIdSchema.optional(),
     notes: z.string().max(500).optional()
   });
   ```

4. **Status Transition Validation:**
   - Define valid transitions in a constant map
   - Validate before allowing update
   - Return 400 for invalid transitions

5. **Integration with Table Occupancy:**
   - Import from `@/lib/table-occupancy`:
     - `holdTable()` for CONFIRMED status
     - `seatTable()` for CHECKED_IN status
   - Handle 409 CONFLICT from occupancy operations
   - Rollback reservation status if occupancy fails

### Database Schema Reference

**reservations table:**
```sql
id: BIGINT PK
company_id: BIGINT FK
outlet_id: BIGINT FK
table_id: BIGINT FK (nullable)
reservation_code: VARCHAR(32) UNIQUE per outlet
status_id: TINYINT (1=PENDING, 2=CONFIRMED, 3=CHECKED_IN, 4=NO_SHOW, 5=CANCELLED, 6=COMPLETED)
party_size: INT
customer_name: VARCHAR(100)
customer_phone: VARCHAR(20)
customer_email: VARCHAR(100)
reservation_time: DATETIME
duration_minutes: INT
notes: TEXT
cancellation_reason: TEXT
created_by: VARCHAR(100)
updated_by: VARCHAR(100)
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

### Important Implementation Notes

1. **Reservation Code Format:**
   - Must be unique per outlet
   - Human-readable (not just UUID)
   - Example: `RES-A7B3`, `RES-20240319-001`
   - Consider: outlet prefix + date + sequence

2. **Status Transition Rules:**
   - Never allow backward transitions (except special admin override)
   - CHECKED_IN can only come from CONFIRMED
   - CANCELLED can come from PENDING or CONFIRMED
   - Once CHECKED_IN, can only go to COMPLETED

3. **Table Assignment:**
   - Optional at creation time
   - Required for CONFIRMED status
   - Must check table availability before holding

4. **Time Handling:**
   - All times in UTC (convert from local in API layer if needed)
   - Grace period for NO_SHOW: configurable (default 15 min after reservation_time)

5. **Testing Fixture Policy:**
   - Since this story CREATES the reservation endpoints, we CAN use them for test setup
   - Use POST /reservations to create test fixtures
   - This resolves the fixture policy issue from Story 12.3

### References

- **Epic 12**: `_bmad-output/planning-artifacts/epics-split/epic-12-table-reservation-pos-sync.md`
- **Architecture**: `_bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md`
- **Previous Story**: `_bmad-output/implementation-artifacts/stories/epic-12/story-12.3.md`
- **Shared Constants**: `packages/shared/src/constants/table-states.ts`
- **Table Occupancy Library**: `apps/api/src/lib/table-occupancy.ts`

## Dev Agent Record

### Agent Model Used

N/A - Story creation phase

### Debug Log References

### Completion Notes List

✅ **2026-03-19 Implementation Complete**

**Implemented Endpoints:**
- GET /api/dinein/reservations - List reservations with filters (statusId, tableId, customerName, date range) and pagination
- GET /api/dinein/reservations/:id - Get single reservation by ID with full details including table info
- POST /api/dinein/reservations - Create new reservation with PENDING status and unique reservation code
- PATCH /api/dinein/reservations/:id - Update reservation status with transition validation and side effects

**Library Functions (apps/api/src/lib/reservations.ts):**
- generateReservationCode() - Generates unique RES-XXXXXX codes with collision retry logic
- createReservationV2() - Creates reservation with tenant isolation
- getReservation() - Retrieves single reservation by ID
- listReservationsV2() - Lists with filtering, pagination, and sorting
- updateReservationStatus() - Handles status transitions with validation

**Status Transitions Implemented:**
- PENDING (1) → CONFIRMED (2): Holds table via holdTable()
- PENDING (1) → CANCELLED (5): Records cancellation reason
- CONFIRMED (2) → CHECKED_IN (3): Seats guests via seatTable()
- CONFIRMED (2) → NO_SHOW (4): Releases table
- CONFIRMED (2) → CANCELLED (5): Releases table with reason
- CHECKED_IN (3) → COMPLETED (6): Finalizes reservation

**Error Handling:**
- 400: Validation errors (Zod), invalid transitions, missing required fields
- 401: Authentication failures
- 403: Authorization failures
- 404: Reservation not found
- 409: Conflicts (handled by occupancy library)
- 500: Unexpected errors

**Integration Points:**
- Uses table-occupancy library functions for table holds/releases
- Leverages Story 12.3's holdTable() and seatTable() for status side effects
- Provides API endpoints that resolve Story 12.3's fixture policy issue

**Validation Results:**
- TypeScript: ✅ Pass
- Build: ✅ Pass
- Lint: ✅ Pass (0 warnings)
- Unit Tests: ✅ 382 tests (381 pass, 1 skipped)

### File List

**Files Created:**
- [x] `apps/api/app/api/dinein/reservations/route.ts` - GET list + POST create reservations
- [x] `apps/api/app/api/dinein/reservations/[reservationId]/route.ts` - GET single + PATCH update reservation
- [x] `apps/api/app/api/dinein/reservations/route.test.ts` - Integration tests for all endpoints
- [x] `apps/api/src/lib/reservations.ts` - Database helper functions (create, get, list, update, generate code)
- [x] `apps/api/src/lib/reservations.test.ts` - Extended with V2 contract tests
- [x] `packages/shared/src/constants/table-states.ts` - Added ReservationStatusV2 constants
- [x] `packages/shared/src/schemas/table-reservation.ts` - Added CreateReservationSchemaV2, UpdateReservationStatusSchemaV2, ListReservationsQuerySchemaV2

**Files to Reference:**
- `apps/api/app/api/dinein/tables/[tableId]/hold/route.ts` - Pattern for occupancy integration
- `apps/api/app/api/dinein/tables/[tableId]/seat/route.ts` - Pattern for session creation
- `apps/api/src/lib/table-occupancy.ts` - Library to integrate with
- `packages/shared/src/constants/table-states.ts` - Status constants

## Senior Developer Review (AI)

- Reviewer: bmad-code-review
- Date: 2026-03-19
- Outcome: Approved (no HIGH blockers)
- Summary: All CRITICAL and HIGH priority issues resolved. Implementation complete with comprehensive test coverage. 382 tests passing (381 pass, 1 skipped). Code review found no remaining blockers.

### Action Items

- [x] All CRITICAL/HIGH issues from initial review resolved
- [x] Test coverage added for V2 contract
- [x] Documentation updated to match implementation

## Change Log

- 2026-03-19: Implementation complete - All 4 endpoints (GET list, GET single, POST create, PATCH update) with status transitions

## Story Context Summary

**What This Story Is:**
Implement the Reservation Management API that enables backoffice users to create, view, and manage table reservations. This includes listing reservations with filters, creating new reservations, and updating reservation status through its lifecycle (PENDING → CONFIRMED → CHECKED_IN → COMPLETED).

**Why It Matters:**
- Enables advance booking for customers
- Provides reservation tracking and management
- Integrates with table occupancy system (Story 12.3)
- Completes the table reservation workflow
- Provides the API foundation for the Reservation Calendar UI (Story 12.8)

**Key Technical Decisions:**
1. **Status Machine**: Clear state transitions with validation
2. **Integration Pattern**: Reuse table-occupancy library functions for table holds
3. **Code Generation**: Human-readable unique codes per outlet
4. **Fixture Policy Resolution**: Since this story CREATES the reservation endpoints, tests can use them for setup (resolving the fixture policy issue from Story 12.3)

**Success Criteria:**
- All 4 endpoints implemented and tested
- Status transitions work correctly
- Integration with table occupancy functions properly
- All error cases handled with appropriate HTTP status codes
- Unit and integration tests passing

**Implementation Notes:**
- This story creates the reservation CRUD endpoints that Story 12.3 deferred
- Must integrate with existing table-occupancy library
- Provides setup endpoints that will enable API-driven test fixtures for future stories
- Reservation code format should be human-readable for staff reference

**Dependencies:**
- **Prerequisites:**
  - Story 12.1: Database migrations applied ✅
  - Story 12.2: Shared constants and schemas ✅
  - Story 12.3: Table occupancy library functions ✅
- **Provides for:**
  - Story 12.5: Can use reservation endpoints for test setup
  - Story 12.8: Reservation Calendar UI API foundation

---

**Next Story:** Story 12.5 (Service Session Management) - depends on this story's reservation endpoints for test setup
