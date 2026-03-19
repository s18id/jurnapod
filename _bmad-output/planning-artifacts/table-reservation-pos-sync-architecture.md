# Table Reservation and POS Multi-Cashier Sync Architecture

**Date:** 2026-03-18  
**Scope:** Outlet table reservation, live table availability, shared dine-in order continuity across multiple POS terminals.  
**Critical Constraint:** Do **not** use DB `ENUM`. Use integer status/type columns with shared constants.

## 1. Goals

- Support reservation lifecycle and real-time table availability.
- Support concurrent cashier operations on the same outlet/table without manual handover.
- Preserve offline-first behavior and idempotent sync semantics.
- Maintain tenant/outlet isolation and accounting traceability.

## 2. Domain Separation

1. `reservation` (future intent): booking window and party details.
2. `occupancy` (current physical state): which table is available/occupied now.
3. `service_session` (commercial context): open dine-in ticket and order mutations.
4. `table_event` (audit + sync): append-only events for replay/idempotency.

## 3. Status/Type Modeling Rule (No ENUM)

Use integer columns (`TINYINT`/`SMALLINT`) and shared constants in code.

Example constants package (`packages/shared/src/constants/table-states.ts`):

```ts
export const RESERVATION_STATUS = {
  PENDING: 1,
  CONFIRMED: 2,
  CHECKED_IN: 3,
  NO_SHOW: 4,
  CANCELLED: 5,
  COMPLETED: 6,
} as const;

export const OCCUPANCY_STATUS = {
  AVAILABLE: 1,
  HELD: 2,
  SEATED: 3,
  ORDERING: 4,
  OCCUPIED: 5,
  PAYMENT: 6,
  CLEARING: 7,
} as const;

export const SESSION_STATUS = {
  OPEN: 1,
  LOCKED_FOR_PAYMENT: 2,
  CLOSED: 3,
  VOIDED: 4,
} as const;

export const TABLE_EVENT_TYPE = {
  RESERVATION_CREATED: 101,
  RESERVATION_UPDATED: 102,
  RESERVATION_CANCELLED: 103,
  RESERVATION_CHECKED_IN: 104,
  TABLE_HELD: 201,
  TABLE_SEATED: 202,
  TABLE_RELEASED: 203,
  TABLE_STATE_CHANGED: 204,
  SESSION_OPENED: 301,
  SESSION_LINE_ADDED: 302,
  SESSION_LINE_UPDATED: 303,
  SESSION_LINE_REMOVED: 304,
  SESSION_LOCKED: 305,
  SESSION_CLOSED: 306,
} as const;
```

Rationale:
- MySQL/MariaDB portability and migration safety.
- Easier backward-compatible evolution.
- Better API/sync contract stability across services.

## 4. Proposed Tables

### 4.1 `outlet_tables`
- `id` PK
- `company_id`, `outlet_id` (indexed, required)
- `table_code` (unique per outlet)
- `capacity`
- `is_active` (tinyint)
- `created_at`, `updated_at`

### 4.2 `table_reservations`
- `id` PK
- `company_id`, `outlet_id`, `table_id`
- `reservation_code` (unique per outlet)
- `status_id` (int, constants)
- `party_size`
- `start_at`, `end_at`
- `customer_name`, `customer_phone`, `notes`
- `created_by_user_id`, `updated_by_user_id`
- `created_at`, `updated_at`

Indexes:
- `(company_id, outlet_id, table_id, start_at)`
- `(company_id, outlet_id, status_id, start_at)`

### 4.3 `table_occupancy`
- `table_id` PK/FK to `outlet_tables`
- `company_id`, `outlet_id`
- `status_id` (int, constants)
- `held_until` nullable
- `current_reservation_id` nullable
- `current_session_id` nullable
- `version` bigint (optimistic concurrency)
- `updated_by_user_id`, `updated_at`

### 4.4 `table_service_sessions`
- `id` PK
- `company_id`, `outlet_id`, `table_id`
- `status_id` (int, constants)
- `active_order_id` (POS order id)
- `opened_by_user_id`, `closed_by_user_id`
- `opened_at`, `closed_at`, `updated_at`
- `version` bigint

Invariant:
- max one active (`OPEN`/`LOCKED_FOR_PAYMENT`) session per table.

### 4.5 `table_events` (append-only)
- `id` PK
- `company_id`, `outlet_id`, `table_id`
- `service_session_id` nullable
- `event_type_id` (int, constants)
- `client_tx_id` (idempotency key; unique per company/outlet)
- `table_version_after` bigint
- `payload_json` (JSON)
- `occurred_at` (client time), `recorded_at` (server time)
- `actor_user_id`, `terminal_id`

Indexes:
- unique `(company_id, outlet_id, client_tx_id)`
- `(company_id, outlet_id, recorded_at)`
- `(company_id, outlet_id, table_id, id)`

## 5. Concurrency and Conflict Model

Mutation request requires:
- `client_tx_id`
- `expected_table_version`
- `company_id`, `outlet_id`, `table_id`

Server flow:
1. Reject if tenant/outlet mismatch.
2. Idempotency check by `client_tx_id`.
3. Compare `expected_table_version` to current version.
4. If mismatch -> `409 CONFLICT` with canonical latest occupancy/session snapshot.
5. If match -> apply mutation transactionally, increment version, append `table_events`.

No silent overwrite; conflicts are explicit and recoverable.

## 6. Availability Computation

`available_now = occupancy.status_id == AVAILABLE && no_active_hold`

Response shape for table board:
- `table_id`, `table_code`, `capacity`
- `occupancy_status_id`
- `available_now` (bool)
- `current_session_id` (nullable)
- `next_reservation_start_at` (nullable)
- `staleness_ms` (derived from `updated_at`)

## 7. API Contract Sketch

- `POST /api/dinein/reservations` create reservation
- `PATCH /api/dinein/reservations/:id` update/cancel/check-in
- `GET /api/dinein/tables/board` live table board + availability
- `POST /api/dinein/tables/:tableId/hold`
- `POST /api/dinein/tables/:tableId/seat`
- `POST /api/dinein/tables/:tableId/release`
- `POST /api/dinein/sessions/open`
- `POST /api/dinein/sessions/:id/lines` add/update/remove lines (idempotent)
- `POST /api/dinein/sessions/:id/lock-payment`
- `POST /api/dinein/sessions/:id/close`

Sync:
- `POST /api/sync/push/table-events`
- `GET /api/sync/pull/table-state?cursor=...`

## 8. Offline-First + Multi-Cashier Sync

- Write locally first + outbox enqueue (`client_tx_id` required).
- Push retries are safe and idempotent.
- Pull returns canonical snapshots + incremental events.
- Two cashiers on overlapping shifts converge to same table/session state after sync.

## 9. Invariants (Must Hold)

1. One active service session per table.
2. No cross-tenant or cross-outlet mutation/read leakage.
3. Duplicate `client_tx_id` must not create duplicate table/session effects.
4. Finalized commercial state changes remain auditable via append-only events.
5. Money/order effects still reconcile to GL posting rules.

## 10. Migration Guidance (MySQL + MariaDB)

- Avoid `ENUM` and non-portable DDL shortcuts.
- Use guarded, rerunnable DDL (`information_schema` checks + dynamic `ALTER`).
- Add integer columns with defaults and backfill in deterministic steps.
- Add indexes/constraints only after backfill success.

## 11. Test Gate (Minimum)

- Dual-terminal race tests for `seat/release/session lock`.
- Replay/idempotency tests for all table/session mutation APIs.
- Offline/reconnect tests for stale versions and deterministic conflict recovery.
- Tenant/outlet isolation tests for all table endpoints.
