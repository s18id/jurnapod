# Story 31.3 Completion Notes

## Status: DONE ✅

## Summary

Completed consolidation of reservations duplicate logic into `@jurnapod/modules-reservations`.

## What Was Done

### Files Created
- `packages/modules/reservations/src/reservations/status-policy.ts` — Status mapping, semantic sets
- `packages/modules/reservations/src/interfaces/audit-port.ts` — Audit port interface + NOOP
- `packages/modules/reservations/src/reservation-groups/service.ts` — Full service implementation

### Files Modified
- `packages/modules/reservations/src/reservation-groups/types.ts` — Added `ReservationGroupActor` type
- `packages/modules/reservations/src/interfaces/shared.ts` — Added `MutationAuditActor`
- `packages/modules/reservations/src/index.ts` — Added exports
- `packages/modules/reservations/src/interfaces/index.ts` — Added audit-port export
- `apps/api/src/lib/reservation-groups.ts` — Deprecated wrapper
- `apps/api/src/lib/outlet-tables.ts` — Deprecated wrapper
- `apps/api/src/lib/reservation-groups.test.ts` — Updated tests with actor

### Key Architectural Decisions

1. **Status Policy**: Package canonical on `status_id`, SEATED maps to CHECKED_IN (3)
2. **Hard-fail on unknown legacy status**: Unknown statuses throw instead of silent fallback
3. **Audit Port Pattern**: Optional audit port avoids hard-coupling to `@jurnapod/modules-platform`
4. **Actor Wiring**: `ReservationGroupActor` type added to input types for proper audit trail

### Technical Debt (Follow-up)

- **Epic 35**: Unify actor types across packages into `@jurnapod/shared`
- **Audit logging in `outlet-tables`**: Not fully wired yet (follow-up)

## Verification

- `npm run typecheck -w @jurnapod/modules-reservations` ✅
- `npm run typecheck -w @jurnapod/api` ✅
- `npm run build -w @jurnapod/modules-reservations` ✅
- `npm run build -w @jurnapod/api` ✅

## Date Completed

2026-04-05
