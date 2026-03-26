# Story 6.5a: Reservations Domain Extraction - Types & Errors

**Status:** ready-for-dev

## Story

As a **Jurnapod developer**,
I want **to extract types and error classes from reservations.ts**,
So that **the reservations domain module follows the same pattern as other domain extractions**.

## Context

This is Part A of Story 6.5 (Reservations Domain Extraction). Following the pattern from:
- Story 6.1a (Sales - Invoice Types)
- Story 6.2a (Service Sessions - Types)

## Acceptance Criteria

**AC1: Types Module**
- Extract `Reservation`, `CreateReservationInput`, `ListReservationsParams`, `UpdateStatusInput` interfaces to `reservations/types.ts`
- Export `ReservationRow` from `@jurnapod/shared`
- Maintain camelCase interfaces for API compatibility

**AC2: Error Classes**
- Extract all error classes to `reservations/types.ts`:
  - `ReservationNotFoundError`
  - `ReservationValidationError`
  - `ReservationConflictError`
  - `InvalidStatusTransitionError`
  - `DuplicateReservationCodeError`

**AC3: DB Row Types**
- Extract `ReservationDbRow` interface to `reservations/types.ts`
- Extract helper row interfaces (`LegacyOverlapRow`, `OccupancySnapshotRow`, etc.)

**AC4: Index Export**
- Create `reservations/index.ts` that re-exports all types
- Update `reservations.ts` to re-export from types module

**AC5: Backward Compatibility**
- All existing exports from `reservations.ts` continue to work
- Routes and other consumers require no changes

## Tasks

- [x] Create `reservations/types.ts` with error classes
- [x] Extract interfaces to `reservations/types.ts`
- [x] Extract DB row types to `reservations/types.ts`
- [x] Create `reservations/index.ts` with re-exports
- [x] Update `reservations.ts` to re-export from types
- [x] Verify type check passes
- [x] Verify tests pass

## Completion Notes

### Files Created
- `lib/reservations/types.ts` - Error classes, interfaces, DB row types, constants
- `lib/reservations/index.ts` - Public exports

### Files Modified
- `lib/reservations.ts` - Added re-export from types module

### Exports Added
Error classes:
- `ReservationNotFoundError`
- `ReservationValidationError`
- `ReservationConflictError`
- `InvalidStatusTransitionError`
- `DuplicateReservationCodeError`

Interfaces:
- `Reservation`
- `CreateReservationInput`
- `ListReservationsParams`
- `UpdateStatusInput`

DB Row types:
- `ReservationDbRow`
- `LegacyOverlapRow`
- `OccupancySnapshotRow`
- `OutletTableStatus`
- `OutletTableRow`

Constants:
- `VALID_TRANSITIONS`
- `MAX_CODE_GENERATION_RETRIES`
- `RESERVATION_DEFAULT_DURATION_KEY`
- `RESERVATION_DEFAULT_DURATION_FALLBACK`
- `finalStatuses`

### Test Results
- TypeScript compilation: ✅ PASS
- Unit tests: ✅ 758/758 PASS

## Files to Create/Modify

| File | Action |
|------|--------|
| `lib/reservations/types.ts` | Create - types and errors |
| `lib/reservations/index.ts` | Create - public exports |
| `lib/reservations.ts` | Modify - add re-exports |

## Dependencies

None - this is the first sub-story in the extraction.

## Notes

- Uses `ReservationRow` from `@jurnapod/shared` as the canonical row type
- DB timestamps are strings in row types
- Reservation time uses unix milliseconds (BIGINT columns)
