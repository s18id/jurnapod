---
epicId: "12"
epicTitle: "Table Reservation and POS Multi-Cashier Sync"
status: "draft"
createdDate: "2026-03-18"
relatedArchitecture: "/home/ahmad/jurnapod/_bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md"
relatedMigrations:
  - "0096_table_state_int_columns.sql"
  - "0097_create_table_occupancy.sql"
  - "0098_create_table_service_sessions.sql"
  - "0099_create_table_events.sql"
---

# Epic 12: Table Reservation and POS Multi-Cashier Sync

Enable table reservation management and support concurrent cashier operations on shared tables with optimistic locking and offline-first sync.

## Goal

Support reservation lifecycle and real-time table availability across multiple POS terminals while preserving offline-first behavior and idempotent sync semantics.

## Success Criteria

- Staff can create, update, and cancel table reservations
- Multiple cashiers can operate on the same table without manual handover
- Table state changes are conflict-free via optimistic locking
- All operations sync reliably with idempotent client_tx_id
- No data loss during concurrent modifications

## Stories

### Story 12.1: Database Schema for Table State Management

**Priority**: P0
**Estimate**: 8h

As a developer,
I want database migrations for table occupancy, service sessions, and events,
So that the system can track table states with optimistic locking and audit trails.

**Acceptance Criteria:**

**Given** existing outlet_tables and reservations tables
**When** migration 0096 executes
**Then** status_id integer columns are added to both tables
**And** existing VARCHAR status values are backfilled to integer constants
**And** composite indexes support tenant-scoped status queries

**Given** migration 0097 executes
**When** table_occupancy table is created
**Then** it includes version column for optimistic locking (default 1)
**And** unique constraint enforces one occupancy record per table
**And** foreign keys link to outlet_tables, service_sessions, and reservations
**And** CHECK constraints validate status transitions (occupied requires session, reserved requires reservation)

**Given** migration 0098 executes
**When** table_service_sessions table is created
**Then** it tracks commercial context (guests, orders, billing)
**And** status lifecycle is enforced: ACTIVE -> COMPLETED/CANCELLED
**And** foreign keys link to outlet_tables, pos_order_snapshots, and users

**Given** migration 0099 executes
**When** table_events table is created
**Then** it supports append-only event logging
**And** unique constraint on (company_id, outlet_id, client_tx_id) ensures idempotency
**And** comprehensive indexes support sync and audit queries
**And** event_type_id constants cover all table operations

**Files Created:**
- `packages/db/migrations/0096_table_state_int_columns.sql`
- `packages/db/migrations/0097_create_table_occupancy.sql`
- `packages/db/migrations/0098_create_table_service_sessions.sql`
- `packages/db/migrations/0099_create_table_events.sql`

---

### Story 12.2: Shared Constants and Zod Schemas

**Priority**: P0
**Estimate**: 4h

As a developer,
I want shared TypeScript constants and Zod schemas for table states,
So that API contracts remain consistent across frontend, backend, and POS.

**Acceptance Criteria:**

**Given** table state constants are defined
**When** packages/shared/src/constants/table-states.ts is created
**Then** it exports TableOccupancyStatus (5 statuses)
**And** it exports ServiceSessionStatus (3 statuses)
**And** it exports TableEventType (8 event types)
**And** it exports ReservationStatusId and OutletTableStatusId for legacy compatibility
**And** validation utilities check status values at runtime

**Given** Zod schemas are defined
**When** packages/shared/src/schemas/table-reservation.ts is created
**Then** it includes entity schemas for TableOccupancy, TableServiceSession, TableEvent
**And** it includes request/response schemas with optimistic locking fields
**And** it includes POS sync schemas for offline-first handling
**And** all schemas validate status/event_type against constants
**And** schemas are exported from packages/shared/src/index.ts

**Files Created:**
- `packages/shared/src/constants/table-states.ts`
- `packages/shared/src/schemas/table-reservation.ts`

**Files Modified:**
- `packages/shared/src/index.ts`

---

### Story 12.3: Table Occupancy API Endpoints

**Priority**: P1
**Estimate**: 6h

As a backoffice user,
I want to view and manage table occupancy states,
So that I can see which tables are available, occupied, or reserved.

**Acceptance Criteria:**

**Given** valid authentication and outlet access
**When** GET /api/dinein/tables/board is called
**Then** it returns all tables with current occupancy status
**And** response includes available_now boolean computed from occupancy state
**And** response includes current_session_id and next_reservation_start_at

**Given** a table with no active session
**When** POST /api/dinein/tables/:tableId/hold is called
**Then** occupancy status changes to RESERVED
**And** held_until timestamp is set
**And** table_events log is appended with HOLD event

**Given** a held or available table
**When** POST /api/dinein/tables/:tableId/seat is called with party details
**Then** occupancy status changes to OCCUPIED
**And** service session is created in ACTIVE state
**And** guest_count is recorded

**Given** an occupied table
**When** POST /api/dinein/tables/:tableId/release is called
**Then** occupancy status changes to AVAILABLE
**And** current session is marked CLOSED
**And** occupied_at is cleared

**Given** concurrent modification attempts
**When** two requests specify same expected_version
**Then** first request succeeds and increments version
**And** second request returns 409 CONFLICT with current state
**And** no data corruption occurs

**API Endpoints:**
- GET /api/dinein/tables/board
- POST /api/dinein/tables/:tableId/hold
- POST /api/dinein/tables/:tableId/seat
- POST /api/dinein/tables/:tableId/release

---

### Story 12.4: Reservation Management API

**Priority**: P1
**Estimate**: 8h

As a backoffice user,
I want to create and manage table reservations,
So that customers can book tables in advance.

**Acceptance Criteria:**

**Given** valid reservation details
**When** POST /api/dinein/reservations is called
**Then** reservation is created with PENDING status
**And** reservation_code is generated unique per outlet
**And** no table is held until confirmed

**Given** an existing reservation
**When** PATCH /api/dinein/reservations/:id is called with status=CONFIRMED
**Then** reservation status updates to CONFIRMED
**And** table is held (if table_id specified)
**And** held_until is set based on reservation duration

**Given** a confirmed reservation
**When** PATCH /api/dinein/reservations/:id is called with status=CHECKED_IN
**Then** customer is seated via seat operation
**And** service session is opened
**And** reservation status updates to CHECKED_IN

**Given** any reservation before check-in
**When** PATCH /api/dinein/reservations/:id is called with status=CANCELLED
**Then** reservation status updates to CANCELLED
**And** any held table is released
**And** cancellation reason is recorded

**Given** valid outlet and date range
**When** GET /api/dinein/reservations is called
**Then** paginated list returns matching reservations
**And** results can be filtered by status, table, or customer

**API Endpoints:**
- GET /api/dinein/reservations
- POST /api/dinein/reservations
- PATCH /api/dinein/reservations/:id
- GET /api/dinein/reservations/:id

---

### Story 12.5: Service Session Management

**Priority**: P1
**Estimate**: 10h

As a cashier,
I want to manage dine-in orders for seated guests,
So that I can add items, process payments, and close tables.

**Acceptance Criteria:**

**Given** an occupied table with active session
**When** POST /api/dinein/sessions/:id/lines is called
**Then** order line is added to linked pos_order
**And** SESSION_LINE_ADDED event is logged
**And** operation is idempotent via client_tx_id

**Given** an existing order line
**When** PATCH /api/dinein/sessions/:id/lines/:lineId is called
**Then** line quantity/price is updated
**And** SESSION_LINE_UPDATED event is logged

**Given** an existing order line
**When** DELETE /api/dinein/sessions/:id/lines/:lineId is called
**Then** line is removed from order
**And** SESSION_LINE_REMOVED event is logged

**Given** guests ready to pay
**When** POST /api/dinein/sessions/:id/lock-payment is called
**Then** session status changes to LOCKED_FOR_PAYMENT
**And** no further line modifications are allowed
**And** SESSION_LOCKED event is logged

**Given** payment completed
**When** POST /api/dinein/sessions/:id/close is called
**Then** session status changes to CLOSED
**And** linked pos_order is finalized
**And** occupancy is released (table becomes AVAILABLE)
**And** SESSION_CLOSED event is logged

**API Endpoints:**
- POST /api/dinein/sessions/:id/lines
- PATCH /api/dinein/sessions/:id/lines/:lineId
- DELETE /api/dinein/sessions/:id/lines/:lineId
- POST /api/dinein/sessions/:id/lock-payment
- POST /api/dinein/sessions/:id/close

---

### Story 12.6: POS Sync for Table Operations

**Priority**: P1
**Estimate**: 12h

As a POS device,
I want to sync table state changes with the server,
So that multiple cashiers see consistent table states across terminals.

**Acceptance Criteria:**

**Given** offline POS operations
**When** POST /api/sync/push/table-events is called with client_tx_id
**Then** idempotency check prevents duplicate processing
**And** events are applied transactionally
**And** table_versions are incremented atomically

**Given** sync with conflicts
**When** expected_table_version doesn't match server version
**Then** 409 CONFLICT is returned with canonical current state
**And** POS can resolve conflict and retry with updated version

**Given** POS needs current state
**When** GET /api/sync/pull/table-state is called with cursor
**Then** response includes table occupancy snapshots
**And** incremental events since cursor are returned
**And** response includes staleness_ms for each table

**Given** two cashiers modify same table simultaneously
**When** both push events with same expected_version
**Then** first operation succeeds
**And** second receives CONFLICT with merged state
**And** both events are logged for audit trail

**Given** network instability
**When** sync retries occur
**Then** exponential backoff is applied (max 5 retries)
**And** duplicate client_tx_id values are silently accepted
**And** no partial state changes are committed

**API Endpoints:**
- POST /api/sync/push/table-events
- GET /api/sync/pull/table-state

---

### Story 12.7: Table Board UI

**Priority**: P2
**Estimate**: 10h

As a backoffice user or cashier,
I want a visual table board showing current table states,
So that I can quickly see availability and manage seating.

**Acceptance Criteria:**

**Given** table board is loaded
**When** outlet is selected
**Then** tables display with color-coded status (available=green, occupied=red, reserved=yellow)
**And** each table shows capacity and current guest count
**And** tables are grouped by zone if configured

**Given** visual table board
**When** table is clicked
**Then** context menu shows available actions based on current state
**And** actions include: Hold, Seat, Release, View Session

**Given** table state changes
**When** another cashier modifies a table
**Then** board updates in near real-time (via polling or WebSocket)
**And** visual indicator shows recently changed tables

**Given** table board with many tables
**When** filters are applied
**Then** tables can be filtered by status, zone, or capacity
**And** view can switch between grid and list layouts

**UI Components:**
- TableBoard page/component
- TableCard component with status colors
- ContextMenu for table actions
- Real-time sync indicator
- Filter and search controls

---

### Story 12.8: Reservation Calendar UI

**Priority**: P2
**Estimate**: 10h

As a backoffice user,
I want a calendar view of reservations,
So that I can manage bookings and identify busy periods.

**Acceptance Criteria:**

**Given** reservation calendar is loaded
**When** date range is selected
**Then** reservations display in calendar grid
**And** each reservation shows time, party size, and status

**Given** calendar view
**When** new reservation is created
**Then** modal collects customer details, party size, date/time
**And** available tables are suggested based on capacity

**Given** existing reservation in calendar
**When** reservation is clicked
**Then** details modal shows full reservation info
**And** actions include: Edit, Cancel, Check In, Send Reminder

**Given** calendar view
**When** date has many reservations
**Then** capacity utilization is displayed (booked vs available tables)
**And** overlapping reservations are highlighted

**Given** mobile device
**When** calendar is viewed
**Then** responsive layout adapts to screen size
**And** touch gestures support swiping between days

**UI Components:**
- ReservationCalendar page/component
- ReservationCard component
- CreateReservationModal
- ReservationDetailsModal
- CapacityIndicator component

## Technical Notes

### Domain Model

1. **reservation** (future intent): booking window and party details
2. **occupancy** (current physical state): which table is available/occupied now
3. **service_session** (commercial context): open dine-in ticket and order mutations
4. **table_event** (audit + sync): append-only events for replay/idempotency

### Critical Constraints

- **No ENUM**: Use integer columns with shared constants
- **Optimistic Locking**: version column on occupancy and sessions
- **Idempotent Sync**: client_tx_id unique per company/outlet
- **Append-Only Events**: Never update or delete table_events
- **Tenant Isolation**: All queries scoped by company_id and outlet_id

### Related Documents

- Architecture: `_bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md`
- Migration Drafts: `_bmad-output/planning-artifacts/db-migration-drafts/table-reservation-sync/`
- Stories Document: `_bmad-output/planning-artifacts/db-migration-drafts/table-reservation-sync/STORIES.md`
