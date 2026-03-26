# Reservations Domain Extraction Coordination

**Purpose:** Coordinate extraction of sub-modules from reservations.ts (1,849 lines) following the pattern from Epic 3 and Stories 6.1/6.2

**Status:** Not started

## Sub-Stories Breakdown

| Sub-Story | Focus | Files to Create | Complexity |
|-----------|-------|-----------------|------------|
| 6.5a | Types & Errors | `reservations/types.ts` | Low |
| 6.5b | Reservation CRUD | `reservations/crud.ts` | Medium |
| 6.5c | Availability & Overlap | `reservations/availability.ts` | Medium |
| 6.5d | Status Management | `reservations/status.ts` | Medium |
| 6.5e | Final Consolidation | `reservations/index.ts` + cleanup | Low |

## Lock Status

| Sub-module | Status | Agent | Started | Completed |
|------------|--------|-------|---------|-----------|
| types | done | agent-6.5a | 2026-03-26 | 2026-03-26 |
| crud | done | agent-6.5b | 2026-03-26 | 2026-03-26 |
| utils | done | agent-6.5c | 2026-03-26 | 2026-03-26 |
| availability | done | agent-6.5c | 2026-03-26 | 2026-03-26 |
| status | done | agent-6.5d | 2026-03-26 | 2026-03-26 |
| consolidation | done | agent-6.5e | 2026-03-26 | 2026-03-26 |

## File Locations

```
apps/api/src/lib/reservations/
├── types.ts           # Error classes, interfaces, DB row types
├── crud.ts            # createReservation, updateReservation, getReservation, listReservations
├── availability.ts    # checkReservationOverlap, availability checking
├── status.ts          # updateReservationStatus, status transitions
├── walk-ins.ts        # Walk-in specific logic
├── groups.ts          # Group/large party logic
├── index.ts           # Public exports
└── reservations.ts    # Original (becomes thin re-export layer)
```

## Dependencies

- `crud (6.5b)` depends on `types (6.5a)`
- `availability (6.5c)` depends on `types (6.5a)`
- `status (6.5d)` depends on `types (6.5a)` and `crud (6.5b)`
- `consolidation (6.5e)` depends on all others

## Critical Rules

1. **ALWAYS read this file before starting work**
2. **ALWAYS update the lock table BEFORE making changes**
3. **NEVER modify reservations.ts without acquiring a lock first**
4. **Maintain backward compatibility** - routes must continue to work

## Original File Structure (reservations.ts)

### Exported Functions (Public API)
- `listReservations` - List reservations with filtering
- `createReservation` - Create new reservation
- `updateReservation` - Update reservation details
- `updateReservationStatus` - Change reservation status
- `getReservation` - Get single reservation
- `generateReservationCode` - Generate unique reservation code
- `createReservationV2` - Newer create API
- `listReservationsV2` - Newer list API

### Internal Helper Functions
- `checkReservationOverlap` - Check time slot conflicts
- `hasActiveReservationOnTable` - Table availability check
- `readReservationForUpdate` - Transaction-scoped read
- `mapDbRowToReservation` - Row mapper
- `canTransition` - Status transition validation

## Notes

- Reservations uses unix milliseconds (BIGINT columns) for `reservation_start_ts` and `reservation_end_ts`
- This is the canonical time format per project conventions
- See AGENTS.md for reservation schema conventions
