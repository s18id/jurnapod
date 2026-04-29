# Story 52-2: Reservation `reservation_at` Legacy Fallback Removal

## Story Metadata

| Field | Value |
|-------|-------|
| Story ID | 52-2 |
| Epic | Epic 52: Datetime Standardization + Idempotency Hardening |
| Title | Reservation `reservation_at` Legacy Fallback Removal |
| Status | backlog |
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

- [ ] All `reservations` table writes use `reservation_start_ts`/`reservation_end_ts` (BIGINT) as canonical
- [ ] `reservation_at` column removed from all insert/update paths after backfill
- [ ] `reservation_at` in API schemas retained as **read-only derived output** (ISO string from `_ts` value via `fromEpochMs` + `resolveEventTime`)
- [ ] Overlap rule enforced: `start < next_end` (end equals next start = non-overlap)
- [ ] Timezone resolution order: `outlet.timezone` → `company.timezone` (no UTC fallback)
- [ ] No query wraps indexed `_ts` columns in SQL functions; applies functions only to constants

## Tasks/Subtasks

- [ ] 2.1 Verify all reservations insert/update paths in `apps/api/src/lib/reservations/crud.ts` write to `reservation_start_ts`/`reservation_end_ts` — no writes to `reservation_at`
- [ ] 2.2 Remove fallback derivation in `apps/api/src/lib/reservations/crud.ts` (lines 192–262 pattern)
- [ ] 2.3 Remove fallback derivation in `apps/api/src/lib/table-occupancy.ts` line 168
- [ ] 2.4 Add migration to enforce `NOT NULL` on `reservation_start_ts` once all callers updated (additive, guarded)
- [ ] 2.5 Add integration test: insert reservation with only `_ts` fields set, verify `reservation_at` derived correctly
- [ ] 2.6 Add integration test: overlap rule `start < next_end` boundary (end == next start = non-overlap)
- [ ] 2.7 Add unit test: timezone resolution order (outlet → company, no UTC fallback)
- [ ] 2.8 Verify: `rg "reservation_at" apps/api/src/lib/reservations/ --type ts | rg "INSERT|UPDATE|insert|update"` returns empty

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
apps/api/src/lib/reservations/crud.ts
apps/api/src/lib/table-occupancy.ts
packages/db/src/migrations/
```

## Change Log

- (none yet)

## Dev Agent Record

- (none yet)