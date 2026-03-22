# Table/Reservation Sync DB Migration Draft Sequence

This folder contains draft migration SQL for the table reservation + multi-cashier POS sync architecture.

## Sequence

1. `0096_table_state_int_columns.sql`
   - Adds canonical integer status columns (`status_id`) to existing `outlet_tables` and `reservations`.
   - Backfills from legacy string status.
   - Keeps legacy columns for compatibility.

2. `0097_create_table_occupancy.sql`
   - Creates canonical live occupancy table keyed by `table_id` with optimistic `version`.

3. `0098_create_table_service_sessions.sql`
   - Creates active table service sessions with status constants and versioning.

4. `0099_create_table_events.sql`
   - Creates append-only table event log with idempotency via `(company_id, outlet_id, client_tx_id)`.

## Critical Modeling Rule

- No `ENUM` in schema.
- Use integer IDs with constants in shared package.

## Compatibility Notes

- SQL is drafted for MySQL 8.0+ and MariaDB 10.2+.
- Uses rerunnable/idempotent guarded DDL patterns (`information_schema` checks + dynamic `ALTER`).
- Keeps existing data paths operational while introducing canonical columns/tables.
