# Story 6.5c: Reservations Domain Extraction - Utils & Availability

**Status:** ready-for-dev

## Story

As a **Jurnapod developer**,
I want **to extract shared utilities and availability checking to dedicated modules**,
So that **the reservations domain follows the same extraction pattern as service-sessions**.

## Context

Following the service-sessions extraction pattern:
- `session-utils.ts` - single source of truth for all helpers
- Sub-modules import from session-utils

For reservations:
- `reservations/utils.ts` - single source of truth for ALL helpers (mappers, date conversions, etc.)
- `reservations/crud.ts` - refactor to import from utils
- `reservations/availability.ts` - extract overlap checking, import from utils
- `reservations/status.ts` - extract status management, import from utils

**CRITICAL: Do NOT import from lib/reservations.ts** - extract helpers to utils first.

## Acceptance Criteria

**AC1: Utils Module**
- Create `reservations/utils.ts` with ALL shared helpers:
  - `toIso`, `toDbDateTime`, `toUnixMs`, `fromUnixMs`
  - `mapRow`, `mapDbRowToReservation`
  - `isFinalStatus`, `canTransition`
  - Any other helpers used across CRUD/availability/status

**AC2: Refactor crud.ts**
- Remove inline helper functions from crud.ts
- Import helpers from utils.ts instead
- Keep CRUD functions (listReservations, getReservation, etc.)

**AC3: Availability Module**
- Extract `checkReservationOverlap` from reservations.ts to `availability.ts`
- Extract `hasActiveReservationOnTable`, `getTableOccupancySnapshotWithConnection`
- Extract `readTableForUpdate`, `setTableStatus`, `hasOpenDineInOrderOnTable`
- Import helpers from utils.ts

**AC4: Status Module**
- Extract `updateReservationStatus` from reservations.ts to `status.ts`
- Extract `generateReservationCode`, `generateReservationCodeWithConnection`
- Import helpers from utils.ts

**AC5: Index & Re-exports**
- Update `reservations/index.ts` to export from utils, crud, availability, status
- Update `reservations.ts` to re-export from sub-modules (becomes thin layer)

**AC6: Tests**
- All existing tests pass

## Dependencies

- 6.5a (types module) - complete
- 6.5b (crud module) - complete

## Tasks

- [x] Create `reservations/utils.ts` with all shared helpers
- [x] Refactor `reservations/crud.ts` to import from utils
- [x] Extract `reservations/availability.ts` using utils
- [ ] Extract `reservations/status.ts` using utils (pending)
- [x] Update `reservations/index.ts` with all exports
- [ ] Update `reservations.ts` to thin re-export layer (pending)
- [x] Verify type check passes
- [x] Verify tests pass

## Completion Notes

### Files Created
- `lib/reservations/utils.ts` - All shared helpers (toIso, toDbDateTime, toUnixMs, fromUnixMs, mapRow, mapDbRowToReservation, isFinalStatus, canTransition, generateReservationCodeWithConnection, columnExists, reservationsOverlap)

### Files Modified
- `lib/reservations/crud.ts` - Refactored to import from utils, re-exports helpers
- `lib/reservations/availability.ts` - Updated imports to use utils

### Quality Gates
- TypeScript compilation: ✅ PASS
- Unit tests: ✅ 758/758 PASS

### Remaining Work
- Extract status.ts (has availability.ts dependency)
- Wire up routes to use reservations/ module
- Thin out reservations.ts to re-export layer
