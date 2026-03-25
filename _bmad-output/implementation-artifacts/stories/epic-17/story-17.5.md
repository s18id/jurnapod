# Story 17.5: Prevent unintended `_ts` exposure in public contracts

Status: done

## Story

As a developer,
I want internal `_ts` fields excluded from public response DTOs unless explicitly required,
so that machine-ordering fields are not mistaken for display or business-date values.

## Acceptance Criteria

1. ✅ Public API response DTOs in affected flows omit internal `_ts` fields unless explicitly documented.
2. ✅ Any intentionally exposed `_ts` field has documented machine-time semantics and matching test coverage.
3. ✅ Contract updates stay aligned between route code and shared schemas.

## Tasks / Subtasks

- [x] Task 1: Audit affected public contracts (AC: 1, 2, 3)
  - [x] Subtask 1.1: Review sync-related schemas in `packages/shared/src/schemas/pos-sync.ts`. (Audit found sync contracts do NOT expose `_ts` fields - no changes needed)
  - [x] Subtask 1.2: Review reservation/public DTOs touched by Epic 17. (Found `ReservationGroupReservationSchema` exposed `reservation_start_ts` and `reservation_end_ts`)
- [x] Task 2: Remove unintended `_ts` leakage (AC: 1, 3)
  - [x] Subtask 2.1: Omit internal machine-time fields where they are not contractually needed. (Removed `_ts` fields from `ReservationGroupReservationSchema`)
  - [x] Subtask 2.2: Keep explicit contract docs/comments for any required `_ts` exposure. (Added documentation comments explaining why `_ts` fields are internal)
- [x] Task 3: Add contract/regression coverage (AC: 2, 3)
  - [x] Subtask 3.1: Update route/schema tests for omitted fields. (Added test "getReservationGroup public contract omits internal _ts fields")
  - [x] Subtask 3.2: Add tests/documentation for any intentional exposed `_ts` field. (N/A - no intentional exposure in this contract)

## Implementation Details

### Changes Made

1. **`packages/shared/src/schemas/reservation-groups.ts`**:
   - Removed `reservation_start_ts: z.number().nullable()` from `ReservationGroupReservationSchema`
   - Removed `reservation_end_ts: z.number().nullable()` from `ReservationGroupReservationSchema`
   - Added documentation explaining these are internal canonical timestamps for overlap/range queries only

2. **`apps/api/src/lib/reservation-groups.ts`**:
   - Removed mapping of `reservation_start_ts` and `reservation_end_ts` in `getReservationGroup()` return value
   - Added comment explaining these are internal machine-time fields omitted from public contract

3. **`apps/api/src/lib/reservation-groups.test.ts`**:
   - Added test "getReservationGroup public contract omits internal _ts fields" to verify:
     - Public fields are present (`reservation_id`, `table_id`, `table_code`, `table_name`, `status`, `reservation_at`)
     - Internal `_ts` fields are NOT present (`reservation_start_ts`, `reservation_end_ts`)

### Fields Removed

- `reservation_start_ts` - Unix ms timestamp (internal, for overlap/range queries)
- `reservation_end_ts` - Unix ms timestamp (internal, for overlap/range queries)

### Testing Results

All 16 tests in `reservation-groups.test.ts` pass:
- 15 existing tests
- 1 new contract verification test

### Compliance Notes

- Per Epic 17, `_ts` fields are treated as internal machine-time metadata unless a contract explicitly requires exposure
- `reservation_at` (ISO 8601 datetime) remains as the public/business-facing field
- Sync contracts were audited and found NOT to expose `_ts` fields unintentionally

## Dev Agent Record

### Agent Model Used

openai/kimi-k2.5

### Debug Log References

- Story created from Epic 17 contract-boundary requirements.
- Narrow scope implementation focused on `ReservationGroupReservationSchema` only.
- Sync contracts verified to not need changes.

### Completion Notes List

- Implementation complete.
- Tests passing (16/16).
- No follow-up scope identified for this story.

### File List

**Files Changed:**
- `packages/shared/src/schemas/reservation-groups.ts`
- `apps/api/src/lib/reservation-groups.ts`
- `apps/api/src/lib/reservation-groups.test.ts`

**Files NOT Changed (per audit):**
- `packages/shared/src/schemas/pos-sync.ts` - sync contracts already compliant
- `apps/api/src/routes/sync/push.ts` - no changes needed
