# Story 6.5d: Reservations Domain Extraction - Status Management

**Status:** done

## Story

As a **Jurnapod developer**,
I want **to extract status management to a dedicated module**,
So that **status transitions are isolated and validated in one place**.

## Context

Part of Story 6.5 (Reservations Domain Extraction). Depends on 6.5a (types).

## Acceptance Criteria

**AC1: Status Module**
- Extract `updateReservationStatus` function to `reservations/status.ts`
- Extract `generateReservationCode` function
- Extract `generateReservationCodeWithConnection` function (with column existence check)

**AC2: Re-exports**
- Update `reservations/index.ts` to export from status module
- Status functions available via `lib/reservations/`

**AC3: Tests**
- Existing tests continue to pass

## Tasks

- [x] Create `reservations/status.ts`
- [x] Extract status transition logic
- [x] Extract status validation
- [x] Update index.ts exports
- [x] Verify type check passes
- [x] Verify tests pass

## Dependencies

- 6.5a (types module) - complete

## Completion Notes

### Files Created/Modified
- `lib/reservations/status.ts` - Status management functions

### Functions in status.ts
- `generateReservationCode` - Generate unique reservation code
- `generateReservationCodeWithConnection` - With connection, with column existence check
- `updateReservationStatus` - Update reservation status with validation

### Quality Gates
- TypeScript compilation: ✅ PASS
- Unit tests: ✅ 758/758 PASS

### Remaining Work
- 6.5e: Final consolidation - wire routes to use reservations/ module, thin out reservations.ts
