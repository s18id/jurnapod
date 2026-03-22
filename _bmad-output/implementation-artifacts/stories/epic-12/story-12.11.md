# Story 12.11: Unified Dine-In Table Journey UI (Walk-In + Reservation)

Status: done

## Story

As a cashier or backoffice operator,
I want a unified table workflow for walk-ins and reservations,
so that I can seat guests faster, avoid table conflicts, and keep reservation and occupancy states consistent.

## Acceptance Criteria

1. **Given** Table Board is loaded for an outlet  
   **When** table cards/rows render  
   **Then** each table shows canonical live state (`occupancyStatusId`, `guestCount`, `currentSessionId`)  
   **And** upcoming reservation context (`nextReservationStartAt`) is visible when present.

2. **Given** an available table without active reservation assignment  
   **When** operator chooses `Seat Walk-in`  
   **Then** UI captures guest count and submits seat action with optimistic version (`X-Expected-Version`)  
   **And** board refreshes and reflects new occupancy/session state.

3. **Given** a reservation in BOOKED/CONFIRMED/ARRIVED state  
   **When** operator performs lifecycle action  
   **Then** status transitions follow allowed flow only (`BOOKED/CONFIRMED -> ARRIVED -> SEATED -> COMPLETED`)  
   **And** cancellation/no-show paths remain explicit (`CANCELLED`, `NO_SHOW`)  
   **And** final statuses are immutable in-place.

4. **Given** operator starts from Table Board  
   **When** they need to create a reservation for a specific table  
   **Then** `New Reservation` opens with outlet + table prefilled  
   **And** existing reservation create validation/suggestion logic is reused.

5. **Given** a table has an upcoming reservation window  
   **When** reservation start is within warning threshold (default 30 minutes)  
   **Then** board shows a visible reserved-soon warning/countdown to reduce accidental walk-in seating conflicts.

6. **Given** concurrent cashier activity modifies table state  
   **When** hold/seat/release action conflicts on expected version  
   **Then** UI surfaces explicit conflict feedback  
   **And** board auto-refreshes canonical state before retry.

7. **Given** occupancy states include AVAILABLE/RESERVED/OCCUPIED/CLEANING/OUT_OF_SERVICE  
   **When** status badges and filters are shown in grid/list views  
   **Then** labels and colors remain explicit and consistent  
   **And** unsafe actions are not offered for incompatible states.

8. **Given** route/module/role boundaries  
   **When** users access reservation/table flows  
   **Then** POS module + role checks remain enforced  
   **And** outlet-scoped operations are preserved (no cross-outlet UI actions).

9. **Given** mobile/tablet usage in live operations  
   **When** board and reservation actions are used  
   **Then** critical actions remain touch-friendly and discoverable  
   **And** no critical action is hidden behind desktop-only interactions.

10. Focused tests validate transition correctness, reserved-soon warning behavior, optimistic-concurrency conflict handling, and route/module gating.

## Tasks / Subtasks

- [x] Task 1: Unify reservation and table status vocabulary and transition rules (AC: 1,3,7)
  - [x] Subtask 1.1: Introduce shared status config for labels/colors/transitions used by Reservations, Reservation Calendar, and Table Board.
  - [x] Subtask 1.2: Remove duplicate per-page transition maps and consume shared config.
  - [x] Subtask 1.3: Centralize final-status immutability checks.

- [x] Task 2: Add reservation-aware indicators to Table Board (AC: 1,5,7)
  - [x] Subtask 2.1: Render `nextReservationStartAt` as human-readable next-booking info.
  - [x] Subtask 2.2: Add reserved-soon warning badge/countdown using threshold logic.
  - [x] Subtask 2.3: Ensure same behavior in both grid and list modes.

- [x] Task 3: Add quick reservation creation from board context (AC: 4,9)
  - [x] Subtask 3.1: Add `New Reservation` action on table board card/row.
  - [x] Subtask 3.2: Prefill outlet/table/time defaults and reuse existing reservation modal logic.
  - [x] Subtask 3.3: Refresh board and reservation data after successful creation.

- [x] Task 4: Harden dine-in table actions for concurrency clarity (AC: 2,6,7)
  - [x] Subtask 4.1: Standardize expected-version header usage for hold/seat/release actions.
  - [x] Subtask 4.2: Standardize conflict message normalization and mandatory board refetch.
  - [x] Subtask 4.3: Prevent duplicate action submit while action is in-flight.

- [x] Task 5: Keep access control and responsive UX compliant (AC: 8,9)
  - [x] Subtask 5.1: Validate route/module/role consistency across `/reservations`, `/reservation-calendar`, and `/table-board`.
  - [x] Subtask 5.2: Ensure touch-safe controls and action discoverability at small breakpoints.

- [x] Task 6: Add focused tests and run quality gates (AC: 10)
  - [x] Subtask 6.1: Update `table-board-page.test.ts` for reserved-soon warning, action gating, and conflicts.
  - [x] Subtask 6.2: Update reservation UI tests for transition consistency and board-prefill flow.
  - [x] Subtask 6.3: Run `npm run test -w @jurnapod/backoffice`.
  - [x] Subtask 6.4: Run `npm run typecheck -w @jurnapod/backoffice`.
  - [x] Subtask 6.5: Run `npm run lint -w @jurnapod/backoffice`.

## Dev Notes

### Story Context

- This story extends Story 12.7 (Table Board), Story 12.8/12.9 (Reservation Calendar), and Story 12.10 (canonical reservation timestamps) into one operator workflow.
- Goal is operational safety and speed at service time, not cosmetic UI refresh.

### Technical Guardrails

- Reuse existing backoffice hooks and APIs (`use-table-board`, `use-reservations`, reservation create/update actions, table hold/seat/release endpoints).
- Keep optimistic concurrency semantics (`X-Expected-Version`) and explicit conflict UX.
- Do not introduce cross-outlet state mutation paths from UI.
- Preserve canonical reservation timing semantics established in Story 12.10.
- No fake real-time claims; continue explicit polling behavior unless a push channel is implemented.

### Expected Files to Touch

- `apps/backoffice/src/features/table-board-page.tsx`
- `apps/backoffice/src/features/reservation-calendar-page.tsx`
- `apps/backoffice/src/features/reservations-page.tsx`
- `apps/backoffice/src/hooks/use-table-board.ts`
- `apps/backoffice/src/features/table-board-page.test.ts`
- `apps/backoffice/src/features/reservation-calendar-page.test.ts`
- `apps/backoffice/src/app/routes.test.ts` (if access/gating behavior changes)

### References

- `_bmad-output/implementation-artifacts/12-7-table-board-ui.md`
- `_bmad-output/implementation-artifacts/12-8-reservation-calendar-ui.md`
- `_bmad-output/implementation-artifacts/stories/epic-12/story-12.9.md`
- `_bmad-output/implementation-artifacts/stories/epic-12/story-12.10.md`
- `_bmad-output/planning-artifacts/epics-split/epic-12-table-reservation-pos-sync.md`
- `_bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md`
- `apps/backoffice/src/features/table-board-page.tsx`
- `apps/backoffice/src/features/reservation-calendar-page.tsx`
- `apps/backoffice/src/features/reservations-page.tsx`
- `apps/api/app/api/dinein/tables/[tableId]/hold/route.ts`
- `apps/api/app/api/dinein/tables/[tableId]/seat/route.ts`
- `apps/api/app/api/dinein/tables/[tableId]/release/route.ts`
- `apps/api/src/lib/reservations.ts`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- Story drafted and approved as new Story 12.11 with narrow-scope execution plan.
- Scopes A/E delegated: shared reservation status vocabulary/transitions extracted and wired across reservations and calendar pages.
- Scopes B/C/D/F delegated: board status split, reserved-soon warnings, new reservation from board, and concurrency hardening.
- Review cycle run after implementation; follow-up fixes applied for non-numeric table prefill fallback, page-level in-flight guard, and timezone-aware reserved-soon display.
- Validation rerun after fixes: backoffice test/typecheck/lint all passing.

### Completion Notes List

- Added shared reservation status contract in `apps/backoffice/src/lib/reservation-status.ts` and migrated reservations/calendar consumers to this canonical source.
- Added explicit table board status handling for `CLEANING` and `OUT_OF_SERVICE` in filters and badges, keeping operational states visible and action-safe.
- Added reserved-soon warning logic from `nextReservationStartAt` in grid and list views with outlet-timezone-aware time formatting.
- Added `New Reservation` action from board rows/cards with prefilled context and modal-based create flow using existing reservation API hook.
- Hardened table board concurrency UX by preventing concurrent mutating actions while an action is in-flight and preserving conflict-refresh behavior.
- Expanded focused tests for status mapping/filtering, reserved-soon helper boundaries, action exposure safety, and busy-state behavior.
- Validation passed: `npm run test -w @jurnapod/backoffice` (`150` pass, `0` fail), `npm run typecheck -w @jurnapod/backoffice`, and `npm run lint -w @jurnapod/backoffice`.

### Senior Developer Review (AI)

- Outcome: Approve (no remaining HIGH/MEDIUM findings).
- Follow-up fixes closed:
  - New reservation action no longer hard-fails when board `tableId` is non-numeric; modal opens with nullable table prefill.
  - Row action concurrency guard strengthened to page-level in-flight lock to avoid parallel conflicting mutations.
  - Reserved-soon absolute time display made timezone-aware using outlet timezone context.

### File List

- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/stories/epic-12/story-12.11.md`
- `apps/backoffice/src/lib/reservation-status.ts`
- `apps/backoffice/src/lib/reservation-status.test.ts`
- `apps/backoffice/src/features/reservation-calendar-page.tsx`
- `apps/backoffice/src/features/reservations-page.tsx`
- `apps/backoffice/src/hooks/use-reservation-calendar.ts`
- `apps/backoffice/src/features/table-board-page.tsx`
- `apps/backoffice/src/features/table-board-page.test.ts`

## Change Log

- 2026-03-20: Created Story 12.11 and split implementation into narrow delegated scopes.
- 2026-03-20: Implemented shared reservation status contract and board UX upgrades (status split, reserved-soon warnings, new reservation flow, concurrency hardening).
- 2026-03-20: Closed review findings and reran backoffice validation gates successfully.
