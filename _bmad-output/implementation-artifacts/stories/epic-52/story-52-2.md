# Story 52-2: Reservation `reservation_at` Legacy Fallback Removal

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 52-2 |
| Epic | Epic 52: Datetime Standardization + Idempotency Hardening |
| Title | Reservation `reservation_at` Legacy Fallback Removal |
| Status | review |
| Risk | P0 |
| Owner | dev |
| QA Gate | yes |
| Dependencies | Story 52-1 (datetime surface consolidated) |

## Story

Remove `reservation_at` usage in favor of `reservation_start_ts`/`reservation_end_ts` (BIGINT unix ms) as the single canonical storage; hard cutover after data backfill.

## Context

Migration 0115 added `reservation_start_ts` / `reservation_end_ts` as canonical `BIGINT` columns. However:
- `apps/api/src/lib/reservations/crud.ts` still has fallback paths checking `IS NULL` then deriving from `reservation_at`
- `apps/api/src/lib/table-occupancy.ts` line 168 has: `UNIX_TIMESTAMP(r.reservation_at) * 1000` as fallback

The `reservation_at` column is a deprecated DATETIME that loses timezone context. Fallback derivation produces wrong epoch values when outlet timezone differs from server.

## Acceptance Criteria

- [x] All `reservations` table writes use `reservation_start_ts`/`reservation_end_ts` (BIGINT) as canonical
- [x] `reservation_at` column removed from all insert/update paths after backfill
- [x] `reservation_at` in API schemas retained as **read-only derived output** (ISO string from `_ts` value via `fromEpochMs` + `resolveEventTime`)
- [x] Overlap rule enforced: `start < next_end` (end equals next start = non-overlap)
- [x] Timezone resolution order: `outlet.timezone` → `company.timezone` (no UTC fallback)
- [x] No query wraps indexed `_ts` columns in SQL functions; applies functions only to constants

## Tasks/Subtasks

- [x] 2.1 Verify all reservations insert/update paths in `apps/api/src/lib/reservations/crud.ts` write to `reservation_start_ts`/`reservation_end_ts` — no writes to `reservation_at`
- [x] 2.2 Remove fallback derivation in `apps/api/src/lib/reservations/crud.ts` (lines 192–262 pattern)
- [x] 2.3 Remove fallback derivation in `apps/api/src/lib/table-occupancy.ts` line 168
- [x] 2.4 Add migration to enforce `NOT NULL` on `reservation_start_ts` once all callers updated (additive, guarded)
- [x] 2.5 Add integration test: insert reservation with only `_ts` fields set, verify `reservation_at` derived correctly
- [x] 2.6 Add integration test: overlap rule `start < next_end` boundary (end == next start = non-overlap)
- [x] 2.7 Add unit test: timezone resolution order (outlet → company, no UTC fallback)
- [x] 2.8 Verify: `rg "reservation_at" apps/api/src/lib/reservations/ --type ts | rg "INSERT|UPDATE|insert|update"` returns empty

## Dev Notes

- **Hard cutover**: after backfill, there must be no runtime path that falls back to `reservation_at` for business logic
- `reservation_at` as read-only derived output means: API response can still include it for backward compat, but it is computed from `_ts` column, not the reverse
- Overlap rule is `a_start < b_end && b_start < a_end` — end equals next start is non-overlap per canonical reservation time schema
- If any existing reservation rows have `reservation_start_ts IS NULL`, they must be backfilled before this story's cutover

## Validation Commands

```bash
# Verify no writes to reservation_at
rg "reservation_at" apps/api/src/lib/reservations/ --type ts | rg "INSERT|UPDATE|insert|update"
# Expected: empty

npm run test:integration -w @jurnapod/api -- --grep "reservation.*overlap\|reservation.*ts" --run
```

## File List

```
apps/api/src/lib/reservations/availability.ts
apps/api/src/lib/reservations/crud.ts
apps/api/src/lib/reservations/index.ts
apps/api/src/lib/reservations/types.ts
apps/api/src/lib/reservations/utils.ts
apps/api/src/lib/table-occupancy.ts
apps/api/__test__/integration/reservations/canonical-ts-cutover.test.ts
packages/modules/reservations/src/reservations/availability.ts
packages/modules/reservations/src/reservations/crud.ts
packages/modules/reservations/src/reservations/types.ts
packages/modules/reservations/src/reservations/utils.ts
packages/modules/reservations/__test__/unit/timezone.test.ts
packages/db/migrations/0196_reservations_canonical_ts_hard_cutover.sql
packages/db/src/kysely/schema.ts
```

## Change Log

- 2026-04-29: Removed `reservation_at` fallback logic from reservation read/write and overlap paths; canonical `_ts` columns are now required for business logic.
- 2026-04-29: Added guarded migration `0196_reservations_canonical_ts_hard_cutover.sql` to backfill and enforce canonical timestamp constraints.
- 2026-04-29: Added integration test for canonical `_ts` behavior + overlap boundary and unit test for timezone resolution order with no UTC fallback.
- 2026-04-29: Code-review patch pass: added canonical timestamp schema fail-fast guard for write paths, removed dead overlap helper export/function, and hardened duration validation.

## Dev Agent Record

- Implemented hard cutover across API and `@jurnapod/modules-reservations` by removing runtime fallback derivation from `reservation_at` and removing `reservation_at` insert/update writes.
- Added mapping guards that throw when `reservation_start_ts` is missing to prevent silent legacy-path execution after cutover.
- Added migration `0196_reservations_canonical_ts_hard_cutover.sql` (guarded/idempotent): backfill `reservation_start_ts`, backfill `reservation_end_ts`, make `reservation_at` nullable, enforce `reservation_start_ts`/`reservation_end_ts` NOT NULL when backfill is complete.
- Added tests:
  - `apps/api/__test__/integration/reservations/canonical-ts-cutover.test.ts`
  - `packages/modules/reservations/__test__/unit/timezone.test.ts`
- Code-review patch pass updates:
  - API + module write paths now fail fast with a migration-required error if canonical timestamp columns are missing.
  - Removed dead API helper/export `reservationsOverlap` after fallback-path removal.
  - Added positive-integer duration validation to prevent invalid overlap windows.
- Validation executed:
  - `npm run typecheck -w @jurnapod/db`
  - `npm run build -w @jurnapod/db`
  - `npm run typecheck -w @jurnapod/modules-reservations`
  - `npm run build -w @jurnapod/modules-reservations`
  - `npm run typecheck -w @jurnapod/api`
  - `npm run build -w @jurnapod/api`
  - `npm run test:unit -w @jurnapod/modules-reservations`
  - `npm run test:single -w @jurnapod/api -- __test__/integration/reservations/canonical-ts-cutover.test.ts`
  - `rg "reservation_at" apps/api/src/lib/reservations/ --type ts | rg "INSERT|UPDATE|insert|update"` (empty output)
