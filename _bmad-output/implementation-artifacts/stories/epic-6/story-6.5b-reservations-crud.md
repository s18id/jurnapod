# Story 6.5b: Reservations Domain Extraction - CRUD Operations

**Status:** done

## Story

As a **Jurnapod developer**,
I want **to extract CRUD operations to a dedicated module**,
So that **the reservations domain follows the same extraction pattern as other domains**.

## Context

Part of Story 6.5 (Reservations Domain Extraction). Depends on 6.5a (types).

## Acceptance Criteria

**AC1: CRUD Module**
- Extract `listReservations` function to `reservations/crud.ts`
- Extract `getReservation` function
- Extract `readReservationOutletId` function
- Extract `updateReservation` function
- Extract `resolveEffectiveDurationMinutes` helper

**AC2: Re-exports**
- Update `reservations/index.ts` to export from crud module
- Update `reservations.ts` to re-export for backward compatibility

**AC3: Tests**
- Existing tests continue to pass

## Tasks

- [x] Create `reservations/crud.ts`
- [x] Extract read operations (list, get, readOutletId)
- [x] Extract update operation
- [x] Extract helper functions
- [x] Update index.ts exports
- [x] Update reservations.ts re-exports
- [x] Verify type check passes
- [x] Verify tests pass

## Dependencies

- 6.5a (types module) must be complete

## Completion Notes

### Files Created
- `lib/reservations/crud.ts` (~420 lines)

### Files Modified
- `lib/reservations/index.ts` - Added CRUD exports
- `lib/reservations.ts` - Added re-exports

### Exports Added
- `listReservations` - List reservations with filtering
- `readReservationOutletId` - Get outlet ID for a reservation
- `getReservation` - Get single reservation by ID
- `updateReservation` - Update reservation details
- `resolveEffectiveDurationMinutes` - Resolve duration from settings
- `mapRow`, `mapDbRowToReservation` - Row mappers

### Quality Gates
- TypeScript compilation: ✅ PASS
- Unit tests: ✅ 758/758 PASS
