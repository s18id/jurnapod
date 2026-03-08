# Phase 4 Verification - Table Operations and Reservations

**Date:** 2026-03-08  
**Phase:** 4 - Table Operations  
**Status:** In Progress (verification-focused)

---

## Scope

Phase 4 validates existing dine-in table operations and reservation integration:

1. Move table flow for open dine-in orders
2. Reservation lifecycle and reservation-to-order continuity
3. Guest and reservation context preservation while resuming/editing
4. Safety checks for table transfer conflicts

---

## Verified Behaviors

### 1. Move Table Flow

- Dine-in table transfer is implemented in `apps/pos/src/pages/CartPage.tsx`.
- Transfer operation is enforced in runtime service with transactional updates in `apps/pos/src/services/runtime-service.ts`.
- On transfer success:
  - source table is released (`AVAILABLE`)
  - target table becomes `OCCUPIED`
  - active order `table_id` is updated
  - linked reservation table assignment is preserved and moved when applicable

### 2. Reservation Lifecycle Integration

- Reservation create/assign/check-in/seat/complete actions are implemented in `apps/pos/src/pages/ReservationsPage.tsx`.
- Reservation context activation hydrates dine-in order context (`tableId`, `reservationId`, `guestCount`, `notes`).
- Continue order from reservation opens products flow with dine-in context preserved.

### 3. Transfer Conflict Safety

- Transfer rejects invalid target table states and conflicting reservations.
- Target table must be available and not reserved by another active reservation.
- Validation occurs in `transferActiveOrderTable(...)` in `apps/pos/src/services/runtime-service.ts`.

---

## Test Coverage Added in This Phase

### Runtime / Integration Tests

File: `apps/pos/src/offline/__tests__/runtime-service-dinein.test.mjs`

- Added: `transferActiveOrderTable blocks moving into table with another active reservation`
  - ensures transfer is rejected when target table is not available / reserved

### E2E Tests

File: `apps/pos/e2e/dine-in-journeys.spec.ts`

- Added: `reservation check-in to seated keeps dine-in context for continue order`
  - create reservation
  - transition status ARRIVED -> SEATED
  - continue order
  - verify dine-in service context and reservation context remain visible

---

## Exit Criteria Snapshot (Phase 4)

- [x] Move table workflow available in cashier UI
- [x] Reservation linkage preserved during active order operations
- [x] Reservation-to-order continuation works in dine-in flow
- [x] Transfer conflict paths are validated and covered by tests

---

## Notes

- Phase 4 remains primarily verification/documentation because core table + reservation capabilities were already implemented before this pass.
- Remaining improvements are optional UX refinements and expanded cross-device conflict scenarios (deferred to later phases).
