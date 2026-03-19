# Story 12.8: Reservation Calendar UI

Status: done

## Story

As a backoffice user,
I want a calendar view of reservations,
so that I can manage bookings and identify busy periods.

## Acceptance Criteria

1. **Given** reservation calendar is loaded
   **When** date range is selected
   **Then** reservations display in calendar grid
   **And** each reservation shows time, party size, and status

2. **Given** calendar view
   **When** new reservation is created
   **Then** modal collects customer details, party size, date/time
   **And** available tables are suggested based on capacity

3. **Given** existing reservation in calendar
   **When** reservation is clicked
   **Then** details modal shows full reservation info
   **And** actions include: Edit, Cancel, Check In, Send Reminder

4. **Given** calendar view
   **When** date has many reservations
   **Then** capacity utilization is displayed (booked vs available tables)
   **And** overlapping reservations are highlighted

5. **Given** mobile device
   **When** calendar is viewed
   **Then** responsive layout adapts to screen size
   **And** touch gestures support swiping between days

## Tasks / Subtasks

- [x] Task 1: Build reservation-calendar data layer from existing APIs (AC: 1,4,5)
  - [x] Subtask 1.1: Add `useReservationCalendar` hook in `apps/backoffice/src/hooks/` that wraps `useReservations` query semantics (`outlet_id`, `from`, `to`, `status`)
  - [x] Subtask 1.2: Add deterministic date-range helpers (day/week bounds in local time, serialized to ISO for API)
  - [x] Subtask 1.3: Add derived calendar groups: per-day reservations, per-slot overlaps, and per-day utilization inputs
  - [x] Subtask 1.4: Preserve API envelope and tenant/outlet scoping behavior from current reservations flow

- [x] Task 2: Implement Reservation Calendar page UI (AC: 1,4,5)
  - [x] Subtask 2.1: Create `apps/backoffice/src/features/reservation-calendar-page.tsx`
  - [x] Subtask 2.2: Reuse `PageCard` + `FilterBar` pattern, with outlet selector and range selector (day/week)
  - [x] Subtask 2.3: Render calendar grid cells containing reservation time, party size, and status badge
  - [x] Subtask 2.4: Render daily capacity utilization (booked tables vs available tables) using outlet tables + reservation assignments
  - [x] Subtask 2.5: Add overlap highlight style for conflicting reservation windows on same table/day

- [x] Task 3: Implement create/edit/details modal workflows (AC: 2,3)
  - [x] Subtask 3.1: Add Create Reservation modal wired to `createReservation` and existing validation rules
  - [x] Subtask 3.2: Add Reservation Details modal opened from calendar item click
  - [x] Subtask 3.3: In details modal, provide actions for Edit, Cancel, and Check In mapped to existing reservation status transitions
  - [x] Subtask 3.4: Add Send Reminder action as non-destructive workflow with explicit state (stub/manual marker if outbound channel is not yet implemented)
  - [x] Subtask 3.5: Suggest available tables by filtering outlet tables against capacity and active reservation conflicts

- [x] Task 4: Integrate route/navigation and access control (AC: 1,5)
  - [x] Subtask 4.1: Add `"/reservation-calendar"` route in `apps/backoffice/src/app/routes.ts` under POS module guard
  - [x] Subtask 4.2: Add route mapping in `apps/backoffice/src/app/router.tsx`
  - [x] Subtask 4.3: Add navigation grouping in `apps/backoffice/src/app/layout.tsx` POS section
  - [x] Subtask 4.4: Keep role boundaries aligned with reservations/table-board (`SUPER_ADMIN`, `OWNER`, `COMPANY_ADMIN`, `ADMIN`, `ACCOUNTANT`)

- [x] Task 5: Add focused test coverage and evidence (AC: 1,2,3,4,5)
  - [x] Subtask 5.1: Add hook tests for range serialization, overlap detection, and utilization computation
  - [x] Subtask 5.2: Add page helper tests for calendar grouping, status display mapping, and overlap highlighting
  - [x] Subtask 5.3: Add modal-action tests for create/edit/cancel/check-in/send-reminder behavior and error handling
  - [x] Subtask 5.4: Add route access/module gating tests and include in `apps/backoffice/src/tests/all.test.ts`

## Dev Notes

### Story Foundation and Business Context

- Story 12.8 extends Story 12.4 (Reservation API) and Story 12.7 (Table Board UI) into a scheduling-first operator view.
- The objective is operational planning and throughput visibility, not replacing occupancy truth: occupancy/session APIs remain canonical for real-time table state.
- Calendar interaction must preserve explicit state transitions and auditability (no hidden mutation paths).
- [Source: _bmad-output/planning-artifacts/epics-split/epic-12-table-reservation-pos-sync.md#Story-12.8-Reservation-Calendar-UI]

### Dependencies and Reuse (Do Not Rebuild)

- Reuse existing reservations hooks and mutation endpoints from `apps/backoffice/src/hooks/use-reservations.ts`.
- Reuse existing outlet-table reads from `apps/backoffice/src/hooks/use-outlet-tables.ts` for capacity and assignment context.
- Reuse existing modal/forms patterns from `apps/backoffice/src/features/reservations-page.tsx` and table-board modal behavior patterns from `apps/backoffice/src/features/table-board-page.tsx`.
- Keep route/module/role checks aligned with existing route system in `apps/backoffice/src/app/routes.ts` and `apps/backoffice/src/app/router.tsx`.
- [Source: apps/backoffice/src/hooks/use-reservations.ts]
- [Source: apps/backoffice/src/features/reservations-page.tsx]
- [Source: apps/backoffice/src/features/table-board-page.tsx]
- [Source: apps/backoffice/src/app/routes.ts]

### Technical Requirements (Mandatory)

1. **Canonical reservation contract only**
   - Use shared `ReservationStatusSchema` and `ReservationRow` shape from `@jurnapod/shared`.
   - Do not introduce alternative reservation status enums in backoffice.
2. **Tenant/outlet isolation**
   - All list/mutation operations must remain outlet-scoped and company-safe via existing auth token flow.
3. **Transition correctness**
   - UI actions must respect existing reservation transition model already used in reservations page.
   - Final statuses are immutable in-place (no unsafe edits).
4. **No fake send-reminder backend behavior**
   - If reminder API is absent, implement explicit non-destructive UX state (e.g., user message/manual reminder marker) rather than pretending delivery.
5. **Responsive and touch behavior**
   - Mobile mode must support day navigation by swipe gesture and have usable touch targets.
6. **No heavy calendar dependency churn**
   - Prefer existing Mantine + app patterns; avoid introducing large calendar frameworks unless strictly required by unmet AC.

### Architecture Compliance Guardrails

- Keep backoffice page structure consistent: top `PageCard`, `FilterBar`, explicit loading/error/empty states.
- Keep API calls through `apiRequest` wrappers in hooks; avoid direct fetch calls in page component.
- Preserve shared contract boundaries (`packages/shared`) and avoid ad-hoc payload shapes.
- Respect global repo invariants: correctness/auditability over cosmetic shortcuts; no cross-tenant leakage.
- [Source: AGENTS.md]
- [Source: docs/project-context.md#Architecture-Principles]

### Library and Framework Requirements

- Backoffice runtime is React 18 + Mantine 7.17.x (`@mantine/core`, `@mantine/dates`).
- Use `Modal` and date components in ways compatible with Mantine 7 APIs currently in repo.
- Mantine public docs now show v8 examples; use them as conceptual guidance only, and adapt to installed v7 package APIs in this codebase.
- Keep Hono/API assumptions unchanged; this story is backoffice UI + existing reservation API consumption.
- [Source: apps/backoffice/package.json]
- [Source: https://mantine.dev/dates/calendar/]
- [Source: https://mantine.dev/core/modal/]
- [Source: https://hono.dev/docs/]

### File Structure Requirements

- Primary files expected:
  - `apps/backoffice/src/features/reservation-calendar-page.tsx`
  - `apps/backoffice/src/hooks/use-reservation-calendar.ts`
  - `apps/backoffice/src/features/reservation-calendar-page.test.ts`
  - `apps/backoffice/src/hooks/use-reservation-calendar.test.ts`
  - `apps/backoffice/src/app/routes.ts`
  - `apps/backoffice/src/app/router.tsx`
  - `apps/backoffice/src/app/layout.tsx`
  - `apps/backoffice/src/app/routes.test.ts`
  - `apps/backoffice/src/tests/all.test.ts`
- Existing files likely extended (not replaced):
  - `apps/backoffice/src/features/reservations-page.tsx`
  - `apps/backoffice/src/hooks/use-reservations.ts`

### Testing Requirements

- Add focused tests for:
  - date-range serialization and query construction
  - overlap detection and utilization math
  - modal action flows and immutable-final-status behavior
  - route/module gating and role access
- Run validation from repo root:
  - `npm run test -w @jurnapod/backoffice`
  - `npm run typecheck -w @jurnapod/backoffice`
  - `npm run lint -w @jurnapod/backoffice`
- If shared/API contracts are touched, run relevant API checks before closure.
- [Source: AGENTS.md#Test-Commands-and-Directory-Structure]

### Previous Story Intelligence (12.7)

- Keep action workflows explicit and conflict-safe; do not hide state errors.
- Continue helper-first test strategy in `table-board-page.test.ts` style for deterministic behavior coverage.
- Keep story artifact and sprint status synchronized with real implementation details.
- Modal UX pattern now established for session detail: open promptly, show loading, then render details.
- [Source: _bmad-output/implementation-artifacts/12-7-table-board-ui.md]

### Git Intelligence Summary

- Recent commits show Epic 12 pattern: backoffice feature + hook + route + tests + artifact updates in one cohesive set.
- Story 12.7 introduced POS route expansion and modal interaction patterns that Story 12.8 should mirror.
- Story 12.6 and 12.5 emphasize deterministic conflict-safe behavior and strict contract adherence; calendar UI should not bypass these semantics.
- [Source: git log -5 --oneline]
- [Source: git log -5 --name-only]

### Project Structure Notes

- Current implementation artifacts for Epic 12 are mixed between root-level story files and `stories/epic-12/`; this story uses workflow default output path at implementation-artifacts root.
- Reservations currently live at `/reservations`; reservation calendar should be additive and not regress existing reservations page workflows.

### References

- `_bmad-output/planning-artifacts/epics-split/epic-12-table-reservation-pos-sync.md`
- `_bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/prd.md`
- `docs/project-context.md`
- `apps/backoffice/src/hooks/use-reservations.ts`
- `apps/backoffice/src/features/reservations-page.tsx`
- `apps/backoffice/src/features/table-board-page.tsx`
- `apps/backoffice/src/app/routes.ts`
- `apps/backoffice/src/app/router.tsx`
- `apps/backoffice/package.json`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- Create-story workflow executed with explicit target `12.8`
- Input discovery protocol executed for epics, PRD, architecture, UX, and project context
- Previous story intelligence loaded from Story 12.7 and Story 12.6 artifacts
- Recent git patterns analyzed from last 5 commits for implementation continuity
- Implemented reservation calendar data hook + page + route wiring using existing reservations and outlet-table contracts
- Added helper-first tests for calendar date range, overlap detection, table suggestions, and route gating
- Validation executed from repo root: backoffice tests, typecheck, lint
- Code-review HIGH findings fixed: modal action execution helpers + tests for create/edit/cancel/check-in/send-reminder and error paths
- Code-review HIGH findings fixed: local-day calendar keys now use local date formatting (timezone-safe grouping)

### Implementation Plan

- Implemented a reusable reservation-calendar hook to centralize range query generation, day grouping, overlap detection, and utilization helpers.
- Built `ReservationCalendarPage` with day/week navigation, swipe support, capacity indicators, overlap highlighting, and modal workflows for create/details/edit/status actions.
- Kept state transitions and API interactions aligned with existing reservations flow; send-reminder is explicit non-destructive UX marker.
- Added route/navigation integration and focused tests, then ran full backoffice validation gates.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Implemented `useReservationCalendar` data layer with deterministic day/week range query generation, day grouping, overlap detection, and daily utilization helpers
- Implemented `ReservationCalendarPage` with outlet/date/status filters, day/week toggle, swipe navigation, calendar grid rendering, overlap highlighting, and capacity utilization indicators
- Added reservation modals for create/edit/details flows with actions: Edit, Cancel, Check In, Send Reminder (explicit non-destructive reminder marker)
- Added table suggestion logic based on capacity and reservation overlap conflict checks
- Added route integration for `/reservation-calendar` in routes, router mapping, and POS navigation group
- Added focused tests for reservation calendar helpers and route/module gating
- Validation evidence:
  - `npm run test -w @jurnapod/backoffice` (130/130 pass)
  - `npm run typecheck -w @jurnapod/backoffice` (pass)
  - `npm run lint -w @jurnapod/backoffice` (pass)
- Post-review fixes:
  - Added executable modal-action helpers in reservation calendar page and expanded tests for create/edit/cancel/check-in/send-reminder + error handling
  - Updated reservation calendar day-key generation/grouping to local date keys to avoid non-UTC day drift

### File List

- `_bmad-output/implementation-artifacts/12-8-reservation-calendar-ui.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/backoffice/src/hooks/use-reservation-calendar.ts`
- `apps/backoffice/src/hooks/use-reservation-calendar.test.ts`
- `apps/backoffice/src/features/reservation-calendar-page.tsx`
- `apps/backoffice/src/features/reservation-calendar-page.test.ts`
- `apps/backoffice/src/app/routes.ts`
- `apps/backoffice/src/app/router.tsx`
- `apps/backoffice/src/app/layout.tsx`
- `apps/backoffice/src/app/routes.test.ts`
- `apps/backoffice/src/tests/all.test.ts`

## Change Log

- 2026-03-20: Implemented Story 12.8 reservation calendar UI (hook, page, modal workflows, route integration, focused tests) and passed backoffice validation suite.
- 2026-03-20: Resolved code-review HIGH issues by adding modal action behavior/error tests and local-day key grouping fix; reran backoffice test/typecheck/lint.
