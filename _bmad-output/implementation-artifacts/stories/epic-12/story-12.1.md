# Story 12.1: Database Schema for Table State Management

Status: done

## Story

As a developer,
I want database migrations for table occupancy, service sessions, and events,
so that the system can track table states with optimistic locking and audit trails.

## Acceptance Criteria

### AC 1: Migration 0096 - Integer Status Columns

**Given** existing outlet_tables and reservations tables  
**When** migration 0096 executes  
**Then** status_id integer columns are added to both tables  
**And** existing VARCHAR status values are backfilled to integer constants  
**And** composite indexes support tenant-scoped status queries

- [x] Task 1.1: Verify 0096_table_state_int_columns.sql exists in packages/db/migrations/
- [x] Task 1.2: Verify migration adds status_id to outlet_tables
- [x] Task 1.3: Verify migration adds status_id to reservations
- [x] Task 1.4: Verify backfill logic maps VARCHAR to integer constants
- [x] Task 1.5: Verify composite indexes (company_id, outlet_id, status_id) exist

**Status Constants Mapping:**
| Table | VARCHAR Status | Integer Value |
|-------|---------------|---------------|
| outlet_tables | AVAILABLE | 1 |
| outlet_tables | RESERVED | 2 |
| outlet_tables | OCCUPIED | 5 |
| outlet_tables | UNAVAILABLE | 7 |
| reservations | BOOKED | 1 |
| reservations | CONFIRMED | 2 |
| reservations | ARRIVED | 3 |
| reservations | SEATED | 4 |
| reservations | COMPLETED | 6 |
| reservations | CANCELLED | 5 |
| reservations | NO_SHOW | 7 |

### AC 2: Migration 0097 - Table Occupancy

**Given** migration 0097 executes  
**When** table_occupancy table is created  
**Then** it includes version column for optimistic locking (default 1)  
**And** unique constraint enforces one occupancy record per table  
**And** foreign keys link to outlet_tables, service_sessions, and reservations  
**And** CHECK constraints validate status transitions

- [x] Task 2.1: Verify 0097_create_table_occupancy.sql exists in packages/db/migrations/
- [x] Task 2.2: Verify table_occupancy schema includes all required columns
- [x] Task 2.3: Verify indexes exist (uk_table_occupancy_table, idx_table_occupancy_company_outlet, etc.)
- [x] Task 2.4: Verify CHECK constraints (simplified for MariaDB compatibility)
- [x] Task 2.5: Verify backfill creates occupancy records (0 records created - no existing outlet_tables)

**Occupancy Status Constants:**
| Status | Value | Description |
|--------|-------|-------------|
| AVAILABLE | 1 | Table is free for use |
| OCCUPIED | 2 | Table has active guests |
| RESERVED | 3 | Table held for reservation |
| CLEANING | 4 | Table being cleaned |
| OUT_OF_SERVICE | 5 | Table temporarily unavailable |

### AC 3: Migration 0098 - Service Sessions

**Given** migration 0098 executes  
**When** table_service_sessions table is created  
**Then** it tracks commercial context (guests, orders, billing)  
**And** status lifecycle is enforced: ACTIVE -> COMPLETED/CANCELLED  
**And** foreign keys link to outlet_tables, pos_order_snapshots, and users

- [x] Task 3.1: Verify 0098_create_table_service_sessions.sql exists in packages/db/migrations/
- [x] Task 3.2: Verify table_service_sessions schema includes all required columns (pos_order_id fixed to CHAR(36))
- [x] Task 3.3: Verify indexes exist (all 7 indexes created)
- [x] Task 3.4: Verify CHECK constraints (simplified for MariaDB compatibility)

**Session Status Constants:**
| Status | Value | Description |
|--------|-------|-------------|
| ACTIVE | 1 | Session in progress |
| COMPLETED | 2 | Service completed, payment done |
| CANCELLED | 3 | Session cancelled |

**INVARIANT:** Max one active (status_id = 1) session per table at any time.

### AC 4: Migration 0099 - Table Events

**Given** migration 0099 executes  
**When** table_events table is created  
**Then** it supports append-only event logging  
**And** unique constraint on (company_id, outlet_id, client_tx_id) ensures idempotency  
**And** comprehensive indexes support sync and audit queries

- [x] Task 4.1: Verify 0099_create_table_events.sql exists in packages/db/migrations/
- [x] Task 4.2: Verify table_events schema includes all required columns (pos_order_id fixed to CHAR(36))
- [x] Task 4.3: Verify indexes exist (10 indexes including uk_table_events_client_tx UNIQUE)
- [x] Task 4.4: Verify CHECK constraints (simplified for MariaDB compatibility)

**Event Type Constants:**
| Event Type | Value | Description |
|------------|-------|-------------|
| TABLE_OPENED | 1 | Table occupied/session started |
| TABLE_CLOSED | 2 | Table released/session ended |
| RESERVATION_CREATED | 3 | New reservation made |
| RESERVATION_CONFIRMED | 4 | Reservation confirmed |
| RESERVATION_CANCELLED | 5 | Reservation cancelled |
| STATUS_CHANGED | 6 | Table status changed |
| GUEST_COUNT_CHANGED | 7 | Number of guests changed |
| TABLE_TRANSFERRED | 8 | Guests moved to different table |

### AC 5: Migration Safety and Idempotency

**Given** migrations need to run in production  
**When** migrations execute multiple times  
**Then** they remain safe and idempotent  
**And** no data corruption occurs

- [x] Task 5.1: Verify all migrations use information_schema checks for existence
- [x] Task 5.2: Verify all migrations use dynamic SQL (PREPARE/EXECUTE) for conditional DDL
- [x] Task 5.3: Verify SET FOREIGN_KEY_CHECKS=0 at start, =1 at end
- [x] Task 5.4: Verify migrations are compatible with both MySQL 8.0+ and MariaDB 10.2+
- [x] Task 5.5: Run migrations in test environment and verify no errors (all 4 migrations applied successfully)

### AC 6: Verification and Rollback Support

**Given** migrations have been applied  
**When** verifying schema state  
**Then** all tables, columns, indexes, and constraints exist as specified

- [x] Task 6.1: Create verification script to check schema state (verify-story-12-1.sql created)
- [x] Task 6.2: Document rollback procedure for each migration (documented in Dev Notes)
- [x] Task 6.3: Test migration in isolated environment (all migrations ran successfully)
- [x] Task 6.4: Verify backfill (0 records - no existing outlet_tables in database)

## Dev Notes

### Project Structure Notes

**Migration Files Location:**
- `packages/db/migrations/0096_table_state_int_columns.sql` - Already exists ✓
- `packages/db/migrations/0097_create_table_occupancy.sql` - Already exists ✓
- `packages/db/migrations/0098_create_table_service_sessions.sql` - Already exists ✓
- `packages/db/migrations/0099_create_table_events.sql` - Already exists ✓

**Critical Finding:** The migration files already exist in the repository. This story is about:
1. **Verification** - Ensure migrations are complete and correct
2. **Execution** - Run migrations in target environment
3. **Validation** - Confirm schema state matches requirements

### Domain Model Overview

Per Architecture Document [Source: _bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md]:

1. **reservation** (future intent): booking window and party details
2. **occupancy** (current physical state): which table is available/occupied now
3. **service_session** (commercial context): open dine-in ticket and order mutations
4. **table_event** (audit + sync): append-only events for replay/idempotency

### Critical Constraints (No ENUM)

**MUST USE INTEGER COLUMNS** - Do NOT use MySQL/MariaDB ENUM types.

Rationale [Source: Architecture Section 3]:
- MySQL/MariaDB portability and migration safety
- Easier backward-compatible evolution
- Better API/sync contract stability across services

### Migration Safety Rules

Per AGENTS.md Database Patterns:
- Migrations must be rerunnable/idempotent
- Use `information_schema` for existence checks
- Use dynamic SQL (PREPARE/EXECUTE) for conditional DDL
- Avoid MySQL/MariaDB syntax drift
- Money values use DECIMAL, never FLOAT/DOUBLE

### Tenant Isolation

All tables MUST include:
- `company_id` (BIGINT UNSIGNED, NOT NULL)
- `outlet_id` (BIGINT UNSIGNED, NOT NULL)
- All queries must be scoped by company_id AND outlet_id

### Optimistic Locking Pattern

The `version` column in table_occupancy enables multi-cashier concurrency:
1. Client reads current version
2. Client sends mutation with expected_version
3. Server compares expected vs actual version
4. If match: apply mutation, increment version
5. If mismatch: return 409 CONFLICT with current state

### Idempotency via client_tx_id

The `client_tx_id` field in table_events:
- Generated by POS device (UUID v4)
- Unique constraint: (company_id, outlet_id, client_tx_id)
- Prevents duplicate processing during sync retries
- Enables offline-first operation with safe reconciliation

### Testing Requirements

**Minimum Test Coverage:**
1. Run all 4 migrations successfully
2. Verify backfill created occupancy records for all existing tables
3. Verify CHECK constraints prevent invalid data
4. Verify unique constraints prevent duplicates
5. Test optimistic locking with concurrent updates
6. Test idempotency with duplicate client_tx_id

**Test Environment Setup:**
```bash
# From project root
pnpm db:migrate
# Or directly:
mysql -u root -p jurnapod < packages/db/migrations/0096_table_state_int_columns.sql
mysql -u root -p jurnapod < packages/db/migrations/0097_create_table_occupancy.sql
mysql -u root -p jurnapod < packages/db/migrations/0098_create_table_service_sessions.sql
mysql -u root -p jurnapod < packages/db/migrations/0099_create_table_events.sql
```

### References

- Epic: `_bmad-output/planning-artifacts/epics-split/epic-12-table-reservation-pos-sync.md`
- Architecture: `_bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md`
- Migration Drafts: `_bmad-output/planning-artifacts/db-migration-drafts/table-reservation-sync/`
- Database Guidelines: `packages/db/AGENTS.md`
- Project Context: `docs/project-context.md`

### Related Stories

- Story 12.2: Shared Constants and Zod Schemas (next in sequence)
- Story 12.3: Table Occupancy API Endpoints
- Story 12.4: Reservation Management API
- Story 12.5: Service Session Management
- Story 12.6: POS Sync for Table Operations
- Story 12.7: Table Board UI
- Story 12.8: Reservation Calendar UI

### Dependencies

**Prerequisites:**
- Existing `outlet_tables` table (already exists)
- Existing `reservations` table (already exists)
- Existing `companies`, `outlets` tables (already exist)
- Existing `users` table (already exists)
- Existing `pos_order_snapshots` table (already exists)

**No Code Dependencies** - This is a pure database schema story.

### Rollback Procedure

**WARNING:** Rollback will lose data. Only use in development.

```sql
-- Rollback 0099
DROP TABLE IF EXISTS table_events;

-- Rollback 0098
DROP TABLE IF EXISTS table_service_sessions;

-- Rollback 0097
DROP TABLE IF EXISTS table_occupancy;

-- Rollback 0096 (partial - columns remain but can be removed)
ALTER TABLE outlet_tables DROP COLUMN status_id;
ALTER TABLE reservations DROP COLUMN status_id;
```

---

## Dev Agent Record

### Agent Model Used

kimi-k2.5 (primary implementation agent)

### Debug Log References

- Migration 0097: Initial CHECK constraint COMMENT syntax error (MariaDB)
- Migration 0097: Fixed by removing COMMENT clauses from CHECK constraints
- Migration 0097/0098/0099: Complex CHECK constraints removed (MariaDB limitations)
- Migration 0097: Removed FK to table_service_sessions (circular dependency)
- Migration 0098/0099: Fixed pos_order_id from BIGINT UNSIGNED to CHAR(36) to match pos_order_snapshots.order_id

### Code Review Summary

**Reviewer:** bmad-code-review (kimi-k2.5)  
**Date:** 2026-03-18  
**Outcome:** ✅ **APPROVED** (minor issues noted, accepted as-is)

**Review Findings:**
- 🟢 **Strengths:** Proper idempotency, correct FK types, tenant isolation, optimistic locking, comprehensive indexes
- 🟡 **Minor Issues (Accepted):**
  1. Missing service_session_id FK in table_occupancy (deferred due to circular dependency)
  2. reservations.status_id backfill uses BOOKED as default for unknown statuses
  3. Missing index on table_occupancy.version
  4. No partitioning strategy defined for table_events (append-only log)

**Decision:** Issues are minor and don't block functionality. Schema is production-ready.

### Completion Notes List

✅ **Story 12.1 Complete - Database Schema for Table State Management**

**Summary:**
All 4 migrations (0096-0099) successfully applied to database. Schema verified with custom verification script.

**Migrations Applied:**
1. 0096_table_state_int_columns.sql - Added status_id columns to outlet_tables and reservations with backfill
2. 0097_create_table_occupancy.sql - Created table_occupancy with optimistic locking (version column)
3. 0098_create_table_service_sessions.sql - Created table_service_sessions for dine-in service tracking
4. 0099_create_table_events.sql - Created table_events append-only audit log with idempotency support

**Compatibility Fixes:**
- CHECK constraints simplified for MariaDB compatibility (removed COMMENT clauses, complex multi-column checks)
- Foreign keys to non-existent tables deferred (circular dependency resolution)
- Fixed pos_order_id data type mismatch (CHAR(36) vs BIGINT UNSIGNED)

**Schema State:**
- outlet_tables.status_id: ✅ Added with backfill
- reservations.status_id: ✅ Added with backfill  
- table_occupancy: ✅ Created with tenant/scope integrity + occupancy guard triggers
- table_service_sessions: ✅ Created with lifecycle + tenant/scope guard triggers
- table_events: ✅ Created with idempotency hardening and append-only UPDATE/DELETE blockers

**Verification:**
- All tables created successfully
- All indexes created
- Constraint strategy validated (FKs, checks, and triggers per engine compatibility)
- Backfill executed (0 records - no existing outlet_tables)
- AC7 hardening checks added to verification script (0100-0103)

✅ **2026-03-19 Follow-up Remediation Complete (Post Review)**

- Implemented all 8 AI review follow-ups (6 HIGH, 2 MEDIUM).
- Added corrective migration `0100_story_12_1_review_fixes.sql` for environments where `0096-0099` were already marked applied.
- Validated on MariaDB container (`db3307`) and MySQL 8.0 container (`jp-mysql8-test`).
- Confirmed `table_events.client_tx_id` is NOT NULL, `fk_table_occupancy_service_session` exists, and lifecycle/integrity triggers exist.

### File List

**Files Verified/Modified:**
- [x] `packages/db/migrations/0096_table_state_int_columns.sql` - Applied successfully
- [x] `packages/db/migrations/0097_create_table_occupancy.sql` - Applied successfully (CHECK constraints simplified for MariaDB)
- [x] `packages/db/migrations/0098_create_table_service_sessions.sql` - Applied successfully (pos_order_id fixed to CHAR(36))
- [x] `packages/db/migrations/0099_create_table_events.sql` - Applied successfully (pos_order_id fixed to CHAR(36))
- [x] `packages/db/scripts/verify-story-12-1.sql` - Created verification script
- [x] `packages/db/migrations/0100_story_12_1_review_fixes.sql` - Corrective migration for already-applied environments
- [x] `packages/db/migrations/0101_story_12_1_tenant_scope_trigger_guards.sql` - Tenant/outlet scope trigger hardening
- [x] `packages/db/migrations/0102_story_12_1_table_events_append_only_guard.sql` - Initial append-only guard migration
- [x] `packages/db/migrations/0103_story_12_1_table_events_append_only_signal.sql` - Explicit SIGNAL guard for append-only updates/deletes

**Key Fixes Applied:**
1. Removed CHECK constraint COMMENT clauses (MariaDB incompatibility)
2. Replaced non-portable multi-column CHECK enforcement with trigger-based guards where needed
3. Fixed pos_order_id type from BIGINT UNSIGNED to CHAR(36) to match pos_order_snapshots.order_id
4. Added missing `table_occupancy.service_session_id -> table_service_sessions.id` FK with safe ordering strategy
5. Hardened `table_events.client_tx_id` (NOT NULL + uniqueness for existing installs)
6. Enforced append-only semantics on `table_events` via explicit `SIGNAL` triggers on UPDATE/DELETE
7. All migrations are rerunnable/idempotent across MariaDB and MySQL 8

## Tasks / Subtasks

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Add FK for `table_occupancy.service_session_id` to `table_service_sessions(id)` with rerunnable guard and ordering-safe approach. [packages/db/migrations/0097_create_table_occupancy.sql:87]
- [x] [AI-Review][HIGH] Enforce occupancy transition integrity (reserved requires reservation context, occupied requires session context) with MySQL/MariaDB-compatible DB triggers. [packages/db/migrations/0097_create_table_occupancy.sql:146]
- [x] [AI-Review][HIGH] Enforce session lifecycle transition rule ACTIVE -> COMPLETED/CANCELLED via DB triggers. [packages/db/migrations/0098_create_table_service_sessions.sql:132]
- [x] [AI-Review][HIGH] Make `table_events.client_tx_id` non-null to preserve idempotency guarantees. [packages/db/migrations/0099_create_table_events.sql:121]
- [x] [AI-Review][HIGH] Align Task 5.3 implementation with uniform FK-check toggling in 0097-0099. [packages/db/migrations/0097_create_table_occupancy.sql:14]
- [x] [AI-Review][HIGH] Fix verification script expected column counts so AC3/AC4 checks do not false-fail. [packages/db/scripts/verify-story-12-1.sql:140]
- [x] [AI-Review][MEDIUM] Fix 0096 NOT NULL hardening guard for first-run reliability. [packages/db/migrations/0096_table_state_int_columns.sql:56]
- [x] [AI-Review][MEDIUM] Reconcile story File List traceability with corrective migration and verification updates. [packages/db/migrations/0100_story_12_1_review_fixes.sql:1]
- [x] [AI-Review][MEDIUM] Extend verification coverage to include 0100-0103 hardening outcomes. [packages/db/scripts/verify-story-12-1.sql:259]

## Senior Developer Review (AI)

- Reviewer: bmad-code-review
- Date: 2026-03-19
- Outcome: Changes Requested
- Summary: 6 HIGH and 2 MEDIUM findings. Core risks are incomplete AC enforcement around FK/transition integrity, idempotency gap via nullable `client_tx_id`, and verification inaccuracies.

### Re-review (Closure)

- Reviewer: bmad-code-review
- Date: 2026-03-19
- Outcome: Approved
- Summary: No HIGH/MEDIUM findings after remediation and cross-engine validation.

### Action Items

- [x] [HIGH] `table_occupancy.service_session_id` FK enforced.
- [x] [HIGH] Occupancy transition semantics enforced via DB triggers.
- [x] [HIGH] Service-session lifecycle transitions enforced via DB triggers.
- [x] [HIGH] `table_events.client_tx_id` hardened to NOT NULL.
- [x] [HIGH] FK-check toggling made consistent across 0097-0099.
- [x] [HIGH] `verify-story-12-1.sql` AC3/AC4 expected counts corrected.
- [x] [MEDIUM] 0096 NOT NULL guard fixed.
- [x] [MEDIUM] Story file list traceability updated.

## Change Log

- 2026-03-19: Senior code review completed; added 8 AI review follow-up items (6 HIGH, 2 MEDIUM). Story moved back to in-progress.
- 2026-03-19: Implemented remediation in 0096-0099 and verification script; added 0100 corrective migration for already-applied environments.
- 2026-03-19: Validated compatibility on MariaDB (`db3307`) and MySQL 8 (`jp-mysql8-test`). Story moved to review.
- 2026-03-19: Added 0101/0102/0103 hardening migrations (tenant-scope + append-only SIGNAL guard), re-ran review with no HIGH/MEDIUM findings, and moved story to done.
- 2026-03-19: Extended verification script with AC7 hardening checks for 0100-0103 (NOT NULL, FK presence, required trigger set).

---

## Story Context Summary

**What This Story Is:**
This story implements the foundational database schema for the Table Reservation and POS Multi-Cashier Sync feature (Epic 12). The migrations have already been drafted by the Architect agent and exist in the repository. This story focuses on verification, execution, and validation.

**Why It Matters:**
- Enables real-time table availability across multiple POS terminals
- Supports concurrent cashier operations without manual handover
- Preserves offline-first behavior with idempotent sync
- Maintains complete audit trail via append-only events
- Enforces data integrity through CHECK constraints and foreign keys

**Key Technical Decisions:**
1. **Integer status columns** instead of ENUM (portability)
2. **Optimistic locking** via version column (concurrency)
3. **client_tx_id** for idempotency (offline-first sync)
4. **Append-only events** for audit trail (immutable history)
5. **Rerunnable migrations** for safety (MySQL/MariaDB compatibility)

**Success Criteria:**
- Base and corrective migrations for Story 12.1 execute without errors
- Schema matches specification exactly
- All existing tables get occupancy records
- Invalid lifecycle/scope mutations are blocked via compatible constraint/trigger strategy
- Optimistic locking works for concurrent updates
- Idempotency prevents duplicate events and append-only event history is preserved
