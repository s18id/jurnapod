# Table Reservation & POS Sync Implementation Stories

## Epic: TRS-001 - Table Reservation & POS Sync Core Infrastructure

**Objective**: Implement table reservation and multi-cashier POS sync architecture with idempotent event handling and optimistic locking.

**Dependencies**: 
- Existing outlet_tables and reservations schema (migrations 0031, 0061)
- POS order snapshot infrastructure (migrations 0066, 0067)

---

## Stories

### Story TRS-001.1: Database Migration 0096 - Integer Status Columns

**Priority**: P0
**Estimate**: 4h
**Assignee**: TBD

**Description**:
Add integer status_id columns to existing outlet_tables and reservations tables. Follow the pattern from migration 0095 (account_mapping_type_ids) where a canonical integer column is introduced alongside legacy string columns for backward compatibility.

**Acceptance Criteria**:
- [ ] Add `status_id` INT column to outlet_tables with default values
- [ ] Add `status_id` INT column to reservations with default values
- [ ] Create backfill logic to populate status_id from existing VARCHAR status columns
- [ ] Add CHECK constraints ensuring status_id values are valid (1-4 for tables, 1-6 for reservations)
- [ ] Create lookup/index for common queries on status_id
- [ ] Migration is rerunnable and idempotent (uses information_schema checks)
- [ ] All SQL is compatible with MySQL 8.0+ and MariaDB 10.2+

**Files Created**:
- `packages/db/migrations/0096_table_state_int_columns.sql`

**Dev Notes**:
- Follow pattern from 0095_account_mapping_type_ids.sql
- Guard ALTER statements with IF NOT EXISTS checks via information_schema
- Ensure tenant isolation constraints remain intact

---

### Story TRS-001.2: Database Migration 0097 - Table Occupancy Table

**Priority**: P0
**Estimate**: 6h
**Assignee**: TBD

**Description**:
Create table_occupancy table for live table state tracking with optimistic locking for multi-cashier concurrency.

**Acceptance Criteria**:
- [ ] Create table_occupancy with all columns per architecture spec
- [ ] Implement optimistic locking via `version` column (starts at 1, increments on every update)
- [ ] Add foreign keys to outlet_tables, table_service_sessions, and reservations
- [ ] Create unique constraint on table_id (one occupancy record per table)
- [ ] Add indexes for common queries (company_id, outlet_id, status_id)
- [ ] Implement business logic CHECK constraints:
  - When status_id=OCCUPIED, service_session_id and occupied_at must be set
  - When status_id=RESERVED, reservation_id and reserved_until must be set
  - guest_count must be positive if set
- [ ] Backfill initial records for all existing tables (default to AVAILABLE status)
- [ ] Migration is rerunnable and idempotent

**Files Created**:
- `packages/db/migrations/0097_create_table_occupancy.sql`

**Dev Notes**:
- Backfill logic: INSERT IGNORE with status_id=1 (AVAILABLE) for all outlet_tables
- Tenant isolation via company_id and outlet_id FKs
- CHECK constraints enforce data integrity at DB level

---

### Story TRS-001.3: Database Migration 0098 - Service Sessions Table

**Priority**: P0
**Estimate**: 6h
**Assignee**: TBD

**Description**:
Create table_service_sessions table for tracking active dine-in service context (guests, orders, billing).

**Acceptance Criteria**:
- [ ] Create table_service_sessions with all columns per architecture spec
- [ ] Add foreign keys to outlet_tables, pos_order_snapshots, users (server, cashier)
- [ ] Create indexes for status queries and date range filtering
- [ ] Implement business logic CHECK constraints:
  - guest_count must be positive
  - total_amount must be non-negative
  - When status_id=ACTIVE, completed_at must be NULL
  - When status_id=COMPLETED/CANCELLED, completed_at must be set
  - completed_at >= started_at
- [ ] Migration is rerunnable and idempotent

**Files Created**:
- `packages/db/migrations/0098_create_table_service_sessions.sql`

**Dev Notes**:
- This is the commercial context layer linking tables to POS orders
- Nullable FKs allow flexible associations (e.g., session without order yet)
- Track both server and cashier for accountability

---

### Story TRS-001.4: Database Migration 0099 - Event Log Table

**Priority**: P0
**Estimate**: 8h
**Assignee**: TBD

**Description**:
Create table_events append-only log for audit trail, sync replay, and multi-cashier conflict detection. Implements idempotency via client_tx_id for POS offline-first sync.

**Acceptance Criteria**:
- [ ] Create table_events with all columns per architecture spec
- [ ] Add unique constraint on (company_id, outlet_id, client_tx_id) for idempotency
- [ ] Add foreign keys to outlet_tables, table_service_sessions, reservations, pos_order_snapshots
- [ ] Create comprehensive indexes for:
  - Company/outlet scoped queries
  - Event type filtering
  - Date range queries (occurred_at, created_at, synced_at)
  - Session, reservation, and order lookups
- [ ] Implement business logic CHECK constraints:
  - event_type_id must be valid (1-8)
  - occupancy_version_after >= occupancy_version_before (if both set)
  - created_at constraint for offline sync events
- [ ] Migration is rerunnable and idempotent

**Files Created**:
- `packages/db/migrations/0099_create_table_events.sql`

**Dev Notes**:
- Append-only: Never UPDATE or DELETE, only INSERT
- client_tx_id enables idempotent sync from POS devices
- occurred_at tracks when event happened (may differ from created_at for offline events)
- version columns enable optimistic locking conflict detection

---

### Story TRS-001.5: Shared Constants Package

**Priority**: P1
**Estimate**: 3h
**Assignee**: TBD

**Description**:
Create shared TypeScript constants package for all table reservation status IDs and event types. Ensures consistency across database, API, and frontend.

**Acceptance Criteria**:
- [ ] Create `packages/shared/src/constants/table-states.ts`
- [ ] Define constants for:
  - TableOccupancyStatus (AVAILABLE=1, OCCUPIED=2, RESERVED=3, CLEANING=4, OUT_OF_SERVICE=5)
  - ServiceSessionStatus (ACTIVE=1, COMPLETED=2, CANCELLED=3)
  - TableEventType (8 types per architecture spec)
  - ReservationStatusId (6 statuses)
  - OutletTableStatusId (4 statuses)
- [ ] Create label maps for human-readable names
- [ ] Create validation utilities (isValidXxxStatus functions)
- [ ] Export from `packages/shared/src/index.ts`
- [ ] No naming conflicts with existing OutletTableStatus or ReservationStatus enums

**Files Created/Modified**:
- `packages/shared/src/constants/table-states.ts`
- `packages/shared/src/index.ts`

**Dev Notes**:
- Use `as const` for type-safe constants
- Use Id suffix to differentiate from existing string-based schemas
- All validation utilities should be runtime-safe

---

### Story TRS-001.6: Zod Schema Definitions

**Priority**: P1
**Estimate**: 5h
**Assignee**: TBD

**Description**:
Create comprehensive Zod schemas for API validation covering all table reservation entities and POS sync payloads.

**Acceptance Criteria**:
- [ ] Create `packages/shared/src/schemas/table-reservation.ts`
- [ ] Define schemas for:
  - TableOccupancy (with validation of status_id against constants)
  - TableServiceSession (with status validation)
  - TableEvent (with event_type validation)
  - Reservation (updated with status_id)
- [ ] Create request/response schemas:
  - CreateTableOccupancyRequest
  - UpdateTableOccupancyRequest (includes expectedVersion for optimistic locking)
  - CreateServiceSessionRequest
  - CreateTableEventRequest
  - CreateReservationRequest
- [ ] Create POS sync schemas:
  - PosTableSyncRequest (includes clientTxId for idempotency)
  - PosTableSyncResponse (includes conflict handling)
- [ ] All status/event type schemas validate against constants
- [ ] Export from `packages/shared/src/index.ts`

**Files Created/Modified**:
- `packages/shared/src/schemas/table-reservation.ts`
- `packages/shared/src/index.ts`

**Dev Notes**:
- Use `refine` with constant arrays for runtime validation
- Include optimistic locking fields (version, expectedVersion)
- POS sync schemas must handle offline-first scenarios

---

## Implementation Order

1. **TRS-001.5** - Shared Constants (blocks all other stories)
2. **TRS-001.6** - Zod Schemas (depends on constants)
3. **TRS-001.1** - Migration 0096 (adds status_id to existing tables)
4. **TRS-001.2** - Migration 0097 (creates table_occupancy)
5. **TRS-001.3** - Migration 0098 (creates table_service_sessions)
6. **TRS-001.4** - Migration 0099 (creates table_events)

## Definition of Done (All Stories)

- [ ] All acceptance criteria implemented
- [ ] Unit tests written and passing
- [ ] Integration tests for API boundaries
- [ ] Database pool cleanup hooks present (for test files)
- [ ] Code review completed
- [ ] AI review conducted
- [ ] Documentation updated (schema changes, API contracts)
- [ ] Migration tested on MySQL 8.0+ and MariaDB 10.2+

## Architecture References

- **Primary Spec**: `_bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md`
- **Migration Drafts**: `_bmad-output/planning-artifacts/db-migration-drafts/table-reservation-sync/`
- **Pattern Reference**: `packages/db/migrations/0095_account_mapping_type_ids.sql`
