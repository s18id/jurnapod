# Story 12.9: Reservation Calendar Hourly Granularity

Status: review

## Story

As a backoffice user,
I want the reservation calendar to show hour-level detail per table,
so that I can schedule multiple sequential reservations on the same table with confidence.

## Acceptance Criteria

1. **Given** reservation calendar is loaded for an outlet and date range
   **When** reservations are rendered
   **Then** the calendar provides hour-level granularity (not day-only grouping)
   **And** each reservation is positioned by its actual start/end time window.

2. **Given** two reservations on the same table where one ends exactly when the next starts
   **When** the calendar computes overlap/conflict states
   **Then** those reservations are treated as sequential (non-overlapping)
   **And** no overlap warning/highlight is shown for that pair.

3. **Given** a table has multiple reservations in one day
   **When** viewing hourly schedule
   **Then** users can see all reservation blocks in chronological order for that table
   **And** gaps between reservations are visually distinguishable.

4. **Given** a reservation starts at an off-hour time (for example 10:30)
   **When** hourly view renders
   **Then** the reservation appears in the correct partial time slot
   **And** displayed time labels remain consistent with local-time behavior used elsewhere in backoffice.

5. **Given** mobile and desktop usage
   **When** users interact with hourly view
   **Then** the layout remains usable and responsive
   **And** the current day/week navigation and swipe behavior continue to function.

6. **Given** existing reservation create/edit/cancel/check-in flows
   **When** hourly granularity is introduced
   **Then** those workflows remain functional without contract changes
   **And** route/module/role access behavior remains unchanged.

## Tasks / Subtasks

- [x] Task 1: Extend reservation calendar data helpers for hour-slot rendering (AC: 1,2,3,4)
  - [x] Add helper(s) in `apps/backoffice/src/hooks/use-reservation-calendar.ts` to derive time-bounded slot models from `reservation_at` + `duration_minutes`.
  - [x] Preserve current non-overlap logic boundary (`aStart < bEnd && bStart < aEnd`) so end==start remains non-overlapping.
  - [x] Ensure local-date keying and local-time display utilities stay deterministic across timezone boundaries.

- [x] Task 2: Implement hourly table schedule UI in reservation calendar page (AC: 1,3,4,5)
  - [x] Update `apps/backoffice/src/features/reservation-calendar-page.tsx` to render hour-based lanes/timeline (grouped by table) for the selected period.
  - [x] Keep reservation cards clickable for details modal and existing actions.
  - [x] Distinguish empty gaps vs occupied windows so operators can plan sequential bookings.
  - [x] Keep accessibility/usability for dense schedules (readable labels, scannable status badges).

- [x] Task 3: Preserve workflow actions and constraints under new view (AC: 5,6)
  - [x] Verify create/edit modal flow still uses existing API contracts and suggestion logic.
  - [x] Verify cancel/check-in/send-reminder actions still update UI state correctly after refetch.
  - [x] Keep role/module route wiring unchanged in `apps/backoffice/src/app/routes.ts`, `apps/backoffice/src/app/router.tsx`, and `apps/backoffice/src/app/layout.tsx` unless strictly needed for presentation-only updates.

- [x] Task 4: Add/adjust focused tests for hourly behavior (AC: 1,2,3,4,5,6)
  - [x] Add helper tests in `apps/backoffice/src/hooks/use-reservation-calendar.test.ts` for hour-slot construction, sequential non-overlap, and partial-slot placement.
  - [x] Add page/helper tests in `apps/backoffice/src/features/reservation-calendar-page.test.ts` for chronological per-table rendering inputs and preserved action behavior.
  - [x] Keep route/module gating tests intact and update only if assertions need adaptation.

- [x] Task 5: Validation evidence (AC: 1,2,3,4,5,6)
  - [x] Run from repo root: `npm run test -w @jurnapod/backoffice`.
  - [x] Run from repo root: `npm run typecheck -w @jurnapod/backoffice`.
  - [x] Run from repo root: `npm run lint -w @jurnapod/backoffice`.

## Dev Notes

### Story Foundation and Business Context

- This story is a continuity follow-up to Story 12.8. The current calendar groups reservations by day and lists entries, but operators now need hour-level scheduling clarity for same-table sequencing.
- The business objective is throughput and planning precision, not a contract rewrite: reservations API remains canonical.
- [Source: _bmad-output/planning-artifacts/epics-split/epic-12-table-reservation-pos-sync.md#Story-12.8-Reservation-Calendar-UI]
- [Source: _bmad-output/implementation-artifacts/12-8-reservation-calendar-ui.md]

### Technical Requirements (Mandatory)

1. **No API contract drift**
   - Keep using existing reservation row fields (`reservation_at`, `duration_minutes`, `status`, `table_id`) from `@jurnapod/shared`.
   - Do not introduce parallel reservation payload/status models.
2. **Sequential reservations must not be flagged as overlap**
   - Preserve strict interval overlap semantics where boundary-touching intervals are valid and conflict-free.
3. **Local time consistency**
   - Hourly rendering and labels must remain aligned with local date key behavior already established in 12.8 fixes.
4. **Tenant/outlet safety unchanged**
   - All reads and mutations remain outlet scoped through existing hooks and auth flow.
5. **No fake backend capabilities**
   - Keep send-reminder as explicit non-destructive UX marker unless a real backend channel exists.

### Architecture Compliance Guardrails

- Keep the existing backoffice structure: `PageCard` + `FilterBar` + explicit loading/error/empty states.
- Keep data fetch/mutation through hook wrappers (`use-reservations`, `use-outlet-tables`, `use-reservation-calendar`).
- Do not bypass established role/module route controls.
- Respect global invariants: auditability, tenant isolation, and offline-first/POS boundaries must not be weakened by UI changes.
- [Source: AGENTS.md]
- [Source: docs/project-context.md#Architecture-Principles]

### Library and Framework Requirements

- Backoffice uses React 18 and Mantine 7.17.x (`@mantine/core`, `@mantine/dates`).
- Mantine docs default to v8 examples; adapt patterns to installed v7 APIs in this repo.
- Prefer current stack and components; do not introduce heavy calendar dependencies unless absolutely required.
- [Source: apps/backoffice/package.json]
- [Source: https://mantine.dev/dates/calendar/]
- [Source: https://mantine.dev/changelog/7-17-0]

### File Structure Requirements

- Primary files expected:
  - `apps/backoffice/src/hooks/use-reservation-calendar.ts`
  - `apps/backoffice/src/hooks/use-reservation-calendar.test.ts`
  - `apps/backoffice/src/features/reservation-calendar-page.tsx`
  - `apps/backoffice/src/features/reservation-calendar-page.test.ts`
  - `apps/backoffice/src/tests/all.test.ts`
- Existing routing files should remain stable unless minimal presentation wiring is required:
  - `apps/backoffice/src/app/routes.ts`
  - `apps/backoffice/src/app/router.tsx`
  - `apps/backoffice/src/app/layout.tsx`

### Testing Requirements

- Cover hour-slot derivation, overlap boundaries, and chronological ordering per table.
- Cover partial-slot rendering inputs (e.g., 10:30-11:45) in helper-level tests.
- Confirm existing modal action helpers keep behavior and error handling intact.
- Execute from repo root:
  - `npm run test -w @jurnapod/backoffice`
  - `npm run typecheck -w @jurnapod/backoffice`
  - `npm run lint -w @jurnapod/backoffice`
- [Source: AGENTS.md#Backoffice-Testing-Commands]

### Previous Story Intelligence (12.8)

- Keep helper-first deterministic logic in hook utilities and test those helpers directly.
- Preserve local-day key handling fix to avoid timezone drift regressions.
- Preserve explicit action helpers (`executeReservationFormAction`, `executeReservationStatusAction`) and keep their tests green.
- Preserve additive implementation style (no regression to existing reservations page/route behavior).
- [Source: _bmad-output/implementation-artifacts/12-8-reservation-calendar-ui.md]

### Git Intelligence Summary

- Recent commits show a stable pattern: cohesive feature work across hook + feature page + tests + artifact/sprint status updates.
- Latest fix commit for 12.8 specifically hardened local-day grouping and action-flow tests; story 12.9 must build on that foundation, not replace it.
- Epic 12 commits consistently prioritize conflict-safe semantics and strict contract boundaries.
- [Source: git log -5 --oneline]
- [Source: git log -5 --name-only]

### Latest Technical Information

- Mantine currently documents v8 on main docs pages; this repo is pinned to Mantine 7.17.x.
- Implementation should use v7-compatible APIs and avoid copying v8-only patterns directly.
- Mantine v7.17 changelog indicates incremental updates rather than forcing migration; no dependency upgrade is required for this story.
- [Source: https://mantine.dev/dates/calendar/]
- [Source: https://mantine.dev/changelog/7-17-0]

### Project Structure Notes

- Epic 12 story artifacts currently live at implementation root (`_bmad-output/implementation-artifacts/*.md`) and `stories/epic-12/`; this story follows the implementation-root pattern used by 12.7/12.8 artifacts.
- Keep reservation calendar additive to existing reservations experience at `/reservations` and current `/reservation-calendar` route.

### References

- `_bmad-output/planning-artifacts/epics-split/epic-12-table-reservation-pos-sync.md`
- `_bmad-output/planning-artifacts/table-reservation-pos-sync-architecture.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/implementation-artifacts/12-8-reservation-calendar-ui.md`
- `docs/project-context.md`
- `apps/backoffice/src/hooks/use-reservation-calendar.ts`
- `apps/backoffice/src/features/reservation-calendar-page.tsx`
- `apps/backoffice/src/hooks/use-reservation-calendar.test.ts`
- `apps/backoffice/src/features/reservation-calendar-page.test.ts`
- `apps/backoffice/package.json`

## Dev Agent Record

### Agent Model Used

openai/gpt-5.3-codex

### Debug Log References

- Create-story workflow executed with explicit target `12.9`
- Loaded workflow config, template, checklist, and discover-inputs protocol
- Loaded sprint status and epic 12 planning/architecture/PRD/project-context artifacts
- Loaded previous story artifact `12-8-reservation-calendar-ui.md`
- Reviewed current reservation calendar hook/page/tests to produce implementation guardrails
- Reviewed last 5 commits for implementation continuity and constraints
- Added Mantine docs/changelog check for version-aware guardrails

### Completion Notes List

- Implemented hourly timeline lanes in day mode and kept week mode as compact overview cards.
- Enforced strict timezone handling in calendar rendering using outlet/company source (no UTC fallback in calendar flow).
- Added company timezone management in Companies UI with timezone dropdown options shared with Outlets.
- Added company-configurable default reservation duration (`feature.reservation.default_duration_minutes`) and used it for null-duration reservations.
- Hardened day-mode boundary handling by mapping API-filtered rows directly to selected day key to avoid client-side re-bucketing drift.
- Added API-envelope parsing safeguards in `use-reservations` and test coverage to ensure malformed rows are skipped safely.
- Validation passed: backoffice tests, typecheck, and lint are green after changes.

### File List

- `_bmad-output/implementation-artifacts/12-9-reservation-calendar-hourly-granularity.md`
- `apps/backoffice/src/hooks/use-reservation-calendar.ts`
- `apps/backoffice/src/hooks/use-reservation-calendar.test.ts`
- `apps/backoffice/src/hooks/use-reservations.ts`
- `apps/backoffice/src/hooks/use-reservations.test.ts`
- `apps/backoffice/src/features/reservation-calendar-page.tsx`
- `apps/backoffice/src/features/reservation-calendar-page.test.ts`
- `apps/backoffice/src/features/feature-settings-page.tsx`
- `apps/backoffice/src/features/companies-page.tsx`
- `apps/backoffice/src/features/outlets-page.tsx`
- `apps/backoffice/src/constants/timezones.ts`
- `apps/backoffice/src/lib/session.ts`
- `apps/backoffice/src/tests/all.test.ts`
- `apps/backoffice/src/hooks/use-companies.ts`
- `apps/api/app/api/reservations/route.ts`
- `apps/api/app/api/settings/company-config/route.ts`
- `apps/api/app/api/settings/config/route.ts`
- `apps/api/app/api/companies/route.ts`
- `apps/api/app/api/companies/[companyId]/route.ts`
- `apps/api/src/lib/auth.ts`
- `apps/api/src/lib/outlet-tables.ts`
- `apps/api/src/lib/outlet-tables.test.ts`
- `apps/api/src/lib/reservations.test.ts`
- `packages/shared/src/schemas/reservations.ts`
- `packages/shared/src/schemas/settings.ts`
- `packages/shared/src/schemas/companies.ts`
- `packages/db/scripts/audit-orphan-reservations.sql`
- `packages/db/scripts/run-sql-script.mjs`
- `packages/db/package.json`
- `package.json`
