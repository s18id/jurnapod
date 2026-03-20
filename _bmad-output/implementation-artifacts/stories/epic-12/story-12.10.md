# Story 12.10: Reservation Canonical Start/End Unix Timestamps

Status: review

## Story

As a backoffice and API user,
I want reservations to use canonical start/end Unix timestamps,
so that calendar placement, overlap checks, and date-range reporting are deterministic across timezones.

## Acceptance Criteria

1. Reservations table includes canonical `reservation_start_ts` and `reservation_end_ts` (`BIGINT`, unix ms) via rerunnable/idempotent migration compatible with MySQL 8.0+ and MariaDB.
2. Reservation writes dual-write canonical timestamps across all write paths (reservation create/update and sync-created placeholder reservations).
3. Canonical end timestamp is computed as `reservation_end_ts = reservation_start_ts + (effective_duration_minutes * 60000)` where `effective_duration_minutes = duration_minutes ?? company_default_duration_minutes`.
4. Reservation reporting/list/date-range filtering uses `reservation_start_ts` as canonical source.
5. Calendar and overlap logic use both canonical timestamps and preserve non-overlap boundary semantics (`end == next start` is not overlap).
6. Date-only filtering (`date_from`, `date_to`) resolves timezone in order `outlet -> company` and returns validation error when timezone is missing.
7. Query patterns preserve index usage by keeping indexed timestamp columns raw and applying functions only on constants (or using precomputed numeric boundaries).
8. Existing API response contract remains stable (`reservation_at` ISO output remains available), but values are derived from canonical start timestamp.
9. Backfill script updates existing reservations in batches and produces verification output (processed, skipped, parse failures, missing-timezone rows).
10. For legacy rows with `duration_minutes IS NULL`, backfill computes and freezes `reservation_end_ts` using effective company default duration at migration time.
11. Automated tests cover timezone boundary day-classification, overlap semantics, and sync reservation write path behavior with canonical timestamps.

## Tasks / Subtasks

- [x] Task 1: Add canonical reservation timestamp columns and indexes (AC: 1, 7)
  - [x] Subtask 1.1: Add `reservation_start_ts BIGINT NULL` with guarded migration pattern.
  - [x] Subtask 1.2: Add `reservation_end_ts BIGINT NULL` with guarded migration pattern.
  - [x] Subtask 1.3: Add index `(company_id, outlet_id, reservation_start_ts, id)`.
  - [x] Subtask 1.4: Add index `(company_id, outlet_id, table_id, reservation_start_ts, reservation_end_ts, status)`.

- [x] Task 2: Implement canonical timestamp write logic (AC: 2, 3, 8)
  - [x] Subtask 2.1: Update reservation create/update flows in `apps/api/src/lib/reservations.ts` to write start/end timestamp columns.
  - [x] Subtask 2.2: Update sync placeholder reservation path in `apps/api/src/lib/table-sync.ts` to write canonical start/end timestamps.
  - [x] Subtask 2.3: Keep compatibility write/read behavior for legacy `reservation_at` during transition.

- [x] Task 3: Switch filtering, listing, and overlap logic to canonical timestamps (AC: 4, 5, 6, 7)
  - [x] Subtask 3.1: Update list and range filtering in `apps/api/src/lib/reservations.ts` to use `reservation_start_ts`.
  - [x] Subtask 3.2: Update date-only route normalization in `apps/api/app/api/reservations/route.ts` to timestamp boundary filtering.
  - [x] Subtask 3.3: Update overlap checks to use `existing.start < new.end AND existing.end > new.start` with timestamp columns.
  - [x] Subtask 3.4: Update dependent reservation window queries in `apps/api/src/lib/table-occupancy.ts` and `packages/pos-sync/src/core/pos-data-service.ts`.

- [x] Task 4: Backfill existing reservation rows (AC: 9, 10)
  - [x] Subtask 4.1: Add script `packages/db/scripts/backfill-reservation-start-end-ts.mjs`.
  - [x] Subtask 4.2: Resolve per-row timezone via `COALESCE(outlet.timezone, company.timezone)`.
  - [x] Subtask 4.3: Compute `reservation_start_ts` from legacy local wall-clock `reservation_at` and compute frozen `reservation_end_ts`.
  - [x] Subtask 4.4: Emit verification summary and sample rows.

- [x] Task 5: Add regression tests and run validation gates (AC: 11)
  - [x] Subtask 5.1: Add route tests for timezone boundary day-classification (day 19/day 20 cases).
  - [x] Subtask 5.2: Add overlap boundary tests (`end == next start`).
  - [x] Subtask 5.3: Add sync write-path test for canonical start/end timestamps.
  - [x] Subtask 5.4: Ensure DB pool cleanup hooks exist for any touched unit tests using `getDbPool()`.
  - [x] Subtask 5.5: Run `npm run test:unit -w @jurnapod/api`, `npm run typecheck -w @jurnapod/api`, and `npm run lint -w @jurnapod/api`.

## Dev Notes

### Technical Guardrails

- Canonical reservation time schema for all new logic:
  - `reservation_start_ts` = source of truth for reporting and list/range filtering.
  - `reservation_end_ts` = source of truth for calendar rendering and overlap windows.
- Continue returning `reservation_at` in API payloads for compatibility, derived from `reservation_start_ts`.
- Date-only filters must remain strict with timezone resolution order `outlet -> company` and no UTC fallback.
- Query/index safety rule: do not wrap indexed timestamp column in SQL functions; apply function only to constants or pass numeric boundaries from app layer.

### Query Pattern Guidance

- Reporting/date-range query pattern:
  - `reservation_start_ts >= UNIX_TIMESTAMP(?) * 1000`
  - `reservation_start_ts < UNIX_TIMESTAMP(?) * 1000`
- Overlap query pattern:
  - `existing.reservation_start_ts < :new_end_ts AND existing.reservation_end_ts > :new_start_ts`

### Migration and Backfill Safety

- Use guarded, rerunnable migration style (`information_schema` checks + dynamic `ALTER TABLE`).
- Backfill must run in bounded batches and be re-runnable.
- Historical behavior for null duration is frozen at backfill time using effective company default duration.

### References

- `_bmad-output/implementation-artifacts/12-10-reservation-canonical-start-end-unix-timestamps.md`
- `_bmad-output/planning-artifacts/epics-split/epic-12-table-reservation-pos-sync.md`
- `_bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md`
- `docs/project-context.md`
- `apps/api/src/lib/reservations.ts`
- `apps/api/app/api/reservations/route.ts`
- `apps/api/src/lib/table-sync.ts`
- `apps/api/src/lib/table-occupancy.ts`
- `packages/pos-sync/src/core/pos-data-service.ts`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- Story drafted from root-cause analysis and agreed canonical timestamp plan.
- Scope 1 delegated: migration `0110_reservations_start_end_ts.sql` with guarded idempotent DDL and index creation.
- Scope 2 delegated: dual-write start/end timestamp logic in reservation write paths and sync placeholder writes.
- Scope 3 delegated: canonical timestamp read/filter/overlap cutover with legacy-row fallback.
- Scope 4 delegated: dependent reservation window queries updated in table occupancy and POS sync data service.
- Scope 5 delegated: backfill script created and wired to npm scripts (`db:backfill:reservation-ts`).
- Scope 6 delegated: added route/lib/sync regression assertions for canonical timestamp persistence and overlap boundary.
- Validation run from repo root: API unit tests, typecheck, lint.
- Dry-run evidence captured: `npm run db:backfill:reservation-ts -- --dry-run --limit=200`.
- Follow-up hardening: overlap fallback now includes partially populated legacy/canonical rows (`reservation_start_ts` xor `reservation_end_ts` null) to avoid gap-based double booking before full data convergence.

### Completion Notes List

- Added canonical reservation timestamp schema migration with portable, rerunnable MySQL/MariaDB guards.
- Implemented dual-write of `reservation_start_ts` and `reservation_end_ts` in reservation create/update and table sync placeholder reservation creation.
- Switched reservation listing/filtering and overlap checks to canonical timestamp logic while preserving legacy fallback reads before full backfill.
- Updated table board next-reservation window and POS operational reservation pull to canonical timestamp windows.
- Added backfill script with timezone-aware local wall-clock conversion (`outlet -> company`) and frozen default-duration end timestamp computation for null duration rows.
- Added regression tests validating canonical timestamp persistence, strict boundary overlap semantics (`end == next start`), and sync placeholder reservation timestamp population.
- Validation passed: API unit tests (`407` tests, `406` pass, `0` fail, `1` skip), API typecheck, and API lint.
- Post-review hardening rerun passed with same API gates after overlap fallback adjustment.

### File List

- AGENTS.md
- _bmad-output/implementation-artifacts/12-10-reservation-canonical-start-end-unix-timestamps.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/stories/epic-12/story-12.10.md
- apps/api/app/api/reservations/route.test.ts
- apps/api/app/api/sync/push/table-events/route.test.ts
- apps/api/src/lib/reservations.test.ts
- apps/api/src/lib/reservations.ts
- apps/api/src/lib/table-occupancy.ts
- apps/api/src/lib/table-sync.ts
- package.json
- packages/db/migrations/0110_reservations_start_end_ts.sql
- packages/db/package.json
- packages/db/scripts/backfill-reservation-start-end-ts.mjs
- packages/pos-sync/src/core/pos-data-service.ts

## Change Log

- 2026-03-20: Implemented Story 12.10 canonical reservation start/end timestamp migration, dual-write paths, canonical read/filter/overlap logic, dependent query updates, backfill tooling, and regression tests; all API validation gates passed.
- 2026-03-20: Hardened overlap fallback to include partially populated timestamp rows and reran API validation gates.
