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

## Implementation Plan

### Phase 1: Schema (Additive)

- Add `reservation_start_ts BIGINT NULL` and `reservation_end_ts BIGINT NULL` to `reservations`.
- Add guarded indexes:
  - `(company_id, outlet_id, reservation_start_ts, id)`
  - `(company_id, outlet_id, table_id, reservation_start_ts, reservation_end_ts, status)`
- Keep migration rerunnable/idempotent using `information_schema` checks and dynamic `ALTER TABLE`.

### Phase 2: Dual Write

- Update reservation create/update paths to write both canonical timestamp columns.
- Update sync placeholder reservation creation path to write canonical timestamp columns.
- Keep legacy compatibility field behavior during transition.

### Phase 3: Read/Query Cutover

- List/report/date-range filtering uses `reservation_start_ts`.
- Overlap logic uses `reservation_start_ts` and `reservation_end_ts`.
- Date-only filters convert timezone day boundaries to UTC timestamp boundaries and query by ts range.

### Phase 4: Backfill

- Add batch script to fill canonical columns for existing rows.
- Resolve per-row timezone using `COALESCE(outlet.timezone, company.timezone)`.
- For null duration rows, compute/freeze end timestamp using effective company default duration at backfill time.
- Emit verification summary and sample rows.

### Phase 5: Validation and Hardening

- Add regression tests for day boundary and overlap semantics.
- Add sync write-path tests for canonical timestamps.
- Run API test/typecheck/lint gates.
- Follow-up migration to set canonical columns `NOT NULL` after backfill validation.

## Query and Index Rules

- Keep indexed timestamp columns raw in WHERE clauses.
- Apply functions only to constants, for example:
  - `reservation_start_ts >= UNIX_TIMESTAMP(?) * 1000`
  - `reservation_start_ts < UNIX_TIMESTAMP(?) * 1000`
- Prefer passing precomputed numeric boundaries from app layer where practical.

## Tasks / Subtasks

- [x] Task 1: Add migration for canonical timestamp columns and indexes (AC: 1,7)
  - [x] Add migration SQL in `packages/db/migrations/0110_reservations_start_end_ts.sql`
  - [x] Verify migration rerunnable behavior on MySQL and MariaDB

- [x] Task 2: Implement canonical timestamp writes (AC: 2,3,8)
  - [x] Update `apps/api/src/lib/reservations.ts`
  - [x] Update `apps/api/src/lib/table-sync.ts`

- [x] Task 3: Cut over read/filter/overlap to canonical timestamps (AC: 4,5,6,7)
  - [x] Update `apps/api/app/api/reservations/route.ts`
  - [x] Update `apps/api/src/lib/reservations.ts`
  - [x] Update `apps/api/src/lib/table-occupancy.ts`
  - [x] Update `packages/pos-sync/src/core/pos-data-service.ts`

- [x] Task 4: Backfill existing data and generate report (AC: 9,10)
  - [x] Add script `packages/db/scripts/backfill-reservation-start-end-ts.mjs`
  - [x] Run and capture verification output

- [x] Task 5: Tests and quality gates (AC: 11)
  - [x] Add/adjust tests in reservation route and reservation lib suites
  - [x] Validate sync reservation write path behavior
  - [x] Run `npm run test:unit -w @jurnapod/api`
  - [x] Run `npm run typecheck -w @jurnapod/api`
  - [x] Run `npm run lint -w @jurnapod/api`

## Risks and Mitigations

- Risk: legacy `reservation_at` semantics may differ across environments.
  - Mitigation: use controlled backfill with explicit timezone resolution order and verification output.
- Risk: partial cutover causes inconsistent filtering behavior.
  - Mitigation: dual-write first, then switch reads/queries in one scoped change set.
- Risk: overlap regressions.
  - Mitigation: explicit tests for boundary condition `end == next start`.

## Completion Evidence Template

- Files created/modified:
  - `packages/db/migrations/0110_reservations_start_end_ts.sql`
  - `packages/db/scripts/backfill-reservation-start-end-ts.mjs`
  - `apps/api/src/lib/reservations.ts`
  - `apps/api/app/api/reservations/route.ts`
  - `apps/api/src/lib/table-sync.ts`
  - `apps/api/src/lib/table-occupancy.ts`
  - `packages/pos-sync/src/core/pos-data-service.ts`
- Test execution evidence:
  - `npm run test:unit -w @jurnapod/api`
  - `npm run typecheck -w @jurnapod/api`
  - `npm run lint -w @jurnapod/api`
- Data migration evidence:
  - Backfill summary output (processed/skipped/failures)
  - Null-count checks before/after
- Known limitations/follow-ups:
  - Add follow-up migration to enforce `NOT NULL` and retire legacy query paths after stabilization window.

## References

- `_bmad-output/implementation-artifacts/stories/epic-12/story-12.10.md`
- `_bmad-output/planning-artifacts/epics-split/epic-12-table-reservation-pos-sync.md`
- `_bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md`
- `docs/project-context.md`
- `AGENTS.md`
