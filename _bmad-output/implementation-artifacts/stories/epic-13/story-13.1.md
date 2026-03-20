# Story 13.1: Large Party Reservation Groups (Multi-Table Support)

Status: done

## Story

As a backoffice operator,
I want to create reservations for large parties that span multiple tables,
so that I can accommodate groups larger than single-table capacity with automatic table suggestions and unified group management.

## Acceptance Criteria

1. **Given** a party of guests larger than single-table capacity
   **When** creating a new reservation
   **Then** I can enable "Large party (multiple tables)" mode
   **And** the system suggests optimal table combinations based on guest count and availability

2. **Given** large party mode is enabled
   **When** I select a table combination or manually choose tables
   **Then** the system validates total capacity meets guest count
   **And** conflict detection ensures no overlapping reservations

3. **Given** a reservation group is created
   **When** viewing the reservation calendar
   **Then** grouped reservations show a purple "Group" badge
   **And** the detail view shows all linked tables

4. **Given** a reservation group exists
   **When** I need to cancel the entire group
   **Then** I can cancel all linked reservations with one action
   **And** the group is dissolved (reservations unlinked)

5. **Given** I am viewing table suggestions
   **When** suggestions are displayed
   **Then** they are sorted by score (lower = better: fewer tables, less excess capacity)
   **And** conflict detection uses canonical Unix timestamps

## Tasks / Subtasks

- [x] Task 1: Database Schema for reservation_groups (AC: 1,2,3,4)
  - [x] Subtask 1.1: Create `reservation_groups` table migration
  - [x] Subtask 1.2: Add `reservation_group_id` foreign key to `reservations` table
  - [x] Subtask 1.3: Verify timestamp handling with `reservation_start_ts` and `reservation_end_ts`

- [x] Task 2: Shared Types and Zod Schemas (AC: all)
  - [x] Subtask 2.1: Add `ReservationGroupRowSchema` and types
  - [x] Subtask 2.2: Add `ReservationGroupCreateRequestSchema` for multi-table creation
  - [x] Subtask 2.3: Add `TableSuggestionQuerySchema` and `TableSuggestionSchema`
  - [x] Subtask 2.4: Export schemas from shared index

- [x] Task 3: Backend Repository Functions (AC: 1,2,3,4)
  - [x] Subtask 3.1: Implement `createReservationGroupWithTables()` with atomic transaction
  - [x] Subtask 3.2: Implement `checkMultiTableAvailability()` using Unix timestamp overlap detection
  - [x] Subtask 3.3: Implement `suggestTableCombinations()` with scoring algorithm
  - [x] Subtask 3.4: Implement `getReservationGroup()` to fetch group with linked reservations
  - [x] Subtask 3.5: Implement `deleteReservationGroupSafe()` with safety checks

- [x] Task 4: API Endpoints (AC: 1,2,3,4,5)
  - [x] Subtask 4.1: POST `/api/reservation-groups` - Create group with availability check
  - [x] Subtask 4.2: GET `/api/reservation-groups/[id]` - Get group details
  - [x] Subtask 4.3: DELETE `/api/reservation-groups/[id]` - Cancel group (ungroup + delete)
  - [x] Subtask 4.4: GET `/api/reservation-groups/suggest-tables` - Get table suggestions

- [x] Task 5: Frontend API Client Hook (AC: all)
  - [x] Subtask 5.1: Add `createReservationGroup()` function
  - [x] Subtask 5.2: Add `getReservationGroup()` function
  - [x] Subtask 5.3: Add `cancelReservationGroup()` function
  - [x] Subtask 5.4: Add `useTableSuggestions()` hook

- [x] Task 6: Frontend UI Components (AC: 1,2,3)
  - [x] Subtask 6.1: Create `TableMultiSelect` component for manual table selection
  - [x] Subtask 6.2: Create `TableSuggestions` component for displaying suggestions
  - [x] Subtask 6.3: Modify `reservation-calendar-page.tsx` to add multi-table toggle and form
  - [x] Subtask 6.4: Update form submission logic to handle both single/multi-table modes

- [x] Task 7: Calendar Display Enhancements (AC: 3)
  - [x] Subtask 7.1: Add purple "Group" badge to week view reservation cards
  - [x] Subtask 7.2: Add "Group #id" badge to detail modal
  - [x] Subtask 7.3: Add "(G)" indicator to timeline view blocks
  - [x] Subtask 7.4: Add "Cancel Group" button for grouped reservations

- [x] Task 8: Testing (AC: all)
  - [x] Subtask 8.1: Add unit tests for use-reservation-groups hook
  - [x] Subtask 8.2: Add validation tests for multi-table form actions
  - [x] Subtask 8.3: Run full test suite to verify no regressions

- [x] Task 9: Documentation (AC: all)
  - [x] Subtask 9.1: Update API.md with reservation groups endpoints
  - [x] Subtask 9.2: Add HTTP 409 Conflict to status codes

### Review Follow-ups (AI)

- [x] [AI-Review][CRITICAL] Replace placeholder-only hook tests with real unit tests that exercise `createReservationGroup`, `getReservationGroup`, `cancelReservationGroup`, and suggestion fetching behavior (not local object assertions). [apps/backoffice/src/hooks/use-reservation-groups.test.ts] — Tests now mock `globalThis.fetch` and test actual function behavior + error paths.
- [x] [AI-Review][HIGH] Trigger suggestions fetch automatically when multi-table query inputs change (or wire explicit `refetch`) so AC1 is actually implemented in UI flow. [apps/backoffice/src/hooks/use-reservation-groups.ts] — Added `useEffect` inside `useTableSuggestions` to auto-fetch on query change.
- [x] [AI-Review][HIGH] Ensure reservation calendar calls suggestion fetch path; previously no caller invoked `refetch`. Fixed by auto-fetch in hook. [apps/backoffice/src/features/reservation-calendar-page.tsx]
- [x] [AI-Review][HIGH] Show all linked tables in group detail modal (from reservation group detail endpoint), not only the single row table id, to satisfy AC3. [apps/backoffice/src/features/reservation-calendar-page.tsx] — Added `detailGroup` state + `getReservationGroup` call; modal renders full linked table list with code, name, status.
- [x] [AI-Review][HIGH] Make group cancellation semantically cancel linked reservations (status update + cancellation timestamp) before/with ungroup/delete, to satisfy AC4. [apps/api/src/lib/reservation-groups.ts:482] — `deleteReservationGroupSafe` now sets `status='CANCELLED'`, `cancelled_at=NOW()` before unlinking.
- [x] [AI-Review][HIGH] Add `company_id` scope guard to table lookup in availability check to preserve strict tenant isolation invariant. [apps/api/src/lib/reservation-groups.ts:153] — Table query now joins `outlet_tables` with `outlets` and filters by `company_id`.
- [x] [AI-Review][HIGH] Make migration `0112_add_reservation_group_id.sql` rerunnable and MySQL/MariaDB-portable via guarded `information_schema` checks and dynamic ALTER flow per repo migration rules. [packages/db/migrations/0112_add_reservation_group_id.sql] — Fully rewritten with `information_schema` guards, dynamic PREPARE/EXECUTE pattern.
- [x] [AI-Review][MEDIUM] Clear suggestions state on empty fetch responses to avoid stale suggestion cards after query changes. [apps/backoffice/src/features/reservation-calendar-page.tsx] — Removed `length > 0` guard; `setSuggestions(fetchedSuggestions)` is now unconditional.
- [x] [AI-Review][MEDIUM] Reconcile story File List with current git reality (including untracked one-time DB script) for audit transparency. [packages/db/scripts/one-time/backfill-outlet-timezones.sql] — File list updated to reflect actual tracked files; the one-time script was created by a prior migration and is not part of this story's scope.

### Review Follow-ups (AI - Round 2)

- [x] [AI-Review][HIGH] Prevent reservation-group create race conditions by enforcing overlap validation inside the same transaction as inserts (or use locking strategy) to avoid double-booking under concurrent requests. [apps/api/src/lib/reservation-groups.ts] — `createReservationGroupWithTables` now locks selected table rows with `FOR UPDATE`, re-checks conflicts inside the TX, and rolls back on any overlap detected.
- [x] [AI-Review][HIGH] Harden tenant scoping in group detail reservation fetch by filtering reservation rows with `company_id` (and outlet scope where applicable). [apps/api/src/lib/reservation-groups.ts:405] — Reservation query now includes `AND r.company_id = ? AND r.outlet_id = ?` using the already-fetched group row's scope.
- [x] [AI-Review][HIGH] Remove UTC fallback from one-time timezone backfill; follow canonical timezone rule (`outlet -> company`, no UTC fallback when missing). [packages/db/scripts/one-time/backfill-outlet-timezones.sql] — Changed `COALESCE(c.timezone, 'UTC')` to `c.timezone` with `WHERE c.timezone IS NOT NULL`; unresolved outlets (company also NULL) are reported separately.
- [x] [AI-Review][MEDIUM] Update API docs to match actual cancel behavior (linked reservations are cancelled then ungrouped/deleted) and current 409 conflict semantics. [docs/API.md] — Cancel section now describes: cancel → unlink → delete; 409 section fully enumerates protected statuses.
- [x] [AI-Review][MEDIUM] Replace weak multi-table branch test that relies on network failure outcome with deterministic assertion via proper mocking strategy. [apps/backoffice/src/features/reservation-calendar-page.test.ts] — Added injectable `createReservationGroupFn` parameter; test now asserts multi-table branch calls injected function with correct payload.
- [x] [AI-Review][MEDIUM] Align story completion notes/file list with intentional rollback deletion: remove claims that `0113_rollback_reservation_groups.sql` exists, and explicitly document this design decision. [story-13.1.md] — Rollback migration intentionally omitted; no destructive rollback script exists by design.

## Dev Notes

### Implementation Summary

The Large Party Reservation Groups feature enables backoffice operators to create and manage reservations for parties requiring multiple tables. Key components:

**Database:**
- `reservation_groups` table stores group metadata (company_id, outlet_id, total_guest_count)
- `reservations.reservation_group_id` FK links individual reservations to groups
- All canonical timestamps use Unix milliseconds (`reservation_start_ts`, `reservation_end_ts`)

**Backend:**
- Atomic transaction in `createReservationGroupWithTables()` ensures all-or-nothing creation
- `checkMultiTableAvailability()` uses overlap detection: `a_start < b_end && b_start < a_end`
- `suggestTableCombinations()` scores combinations (lower = better: fewer tables + less excess)

**Frontend:**
- Multi-table toggle in reservation form enables large party mode
- `TableSuggestions` displays scored table combinations
- `TableMultiSelect` allows manual table selection with capacity validation
- Calendar view shows purple "Group" badges for linked reservations

### Technical Requirements

1. **Timestamp Contract:** Always use `reservation_start_ts` and `reservation_end_ts` (Unix ms) for overlap checks
2. **Overlap Rule:** `a_start < b_end && b_start < a_end` (end == next start is non-overlap)
3. **Validation:** Multi-table requires 2-10 tables; single-table requires 1 table
4. **Safety:** Group cancellation ungroups reservations (sets `reservation_group_id = NULL`) before deleting group

### References

- [Source: docs/API.md#Reservation-Groups-Large-Party-Support]
- [Source: packages/shared/src/schemas/reservation-groups.ts]
- [Source: apps/api/src/lib/reservation-groups.ts]
- [Source: apps/backoffice/src/hooks/use-reservation-groups.ts]
- [Source: apps/backoffice/src/components/TableMultiSelect.tsx]
- [Source: apps/backoffice/src/components/TableSuggestions.tsx]
- [Source: apps/backoffice/src/features/reservation-calendar-page.tsx]

## Dev Agent Record

### Agent Model Used

opencode-go/minimax-m2.7

### Debug Log References

- Implementation started with database schema migration
- Used `bmad-dev` agent for frontend implementation
- Followed existing reservation calendar patterns for UI consistency

### Completion Notes List

**Database Migrations:**
- `packages/db/migrations/0111_create_reservation_groups.sql` - reservation_groups table
- `packages/db/migrations/0112_add_reservation_group_id.sql` - FK column in reservations (rerunnable, MySQL/MariaDB-safe)
- NOTE: Rollback migration `0113` intentionally omitted — no destructive rollback script by design.

**One-time Scripts:**
- `packages/db/scripts/one-time/backfill-outlet-timezones.sql` - Backfill outlet timezone from company (no UTC fallback; canonical rule compliance)

**Shared Types:**
- `packages/shared/src/schemas/reservation-groups.ts` - All group schemas
- Added `reservation_group_id` to `ReservationRow` in `reservations.ts`

**Backend Repository:**
- `apps/api/src/lib/reservation-groups.ts` - 5 CRUD functions with Unix timestamps

**API Endpoints:**
- `apps/api/app/api/reservation-groups/route.ts` - POST create
- `apps/api/app/api/reservation-groups/[id]/route.ts` - GET/DELETE group
- `apps/api/app/api/reservation-groups/suggest-tables/route.ts` - GET suggestions

**Frontend API Client:**
- `apps/backoffice/src/hooks/use-reservation-groups.ts` - Hook with all CRUD operations

**Frontend Components:**
- `apps/backoffice/src/components/TableMultiSelect.tsx` - Multi-select with capacity validation
- `apps/backoffice/src/components/TableSuggestions.tsx` - Suggestion display with scoring

**Frontend Page Updates:**
- `apps/backoffice/src/features/reservation-calendar-page.tsx` - Multi-table UI and group badges

**Tests:**
- `apps/backoffice/src/hooks/use-reservation-groups.test.ts` - 6 tests
- `apps/backoffice/src/features/reservation-calendar-page.test.ts` - Added 6 validation tests

**Documentation:**
- `docs/API.md` - Added Reservation Groups section

### File List

**Database Migrations:**
- `packages/db/migrations/0111_create_reservation_groups.sql`
- `packages/db/migrations/0112_add_reservation_group_id.sql`
- `packages/db/scripts/one-time/backfill-outlet-timezones.sql` (canonical timezone rule compliance; no rollback migration by design)

**Shared Types:**
- `packages/shared/src/schemas/reservation-groups.ts`
- `packages/shared/src/schemas/reservations.ts` (added reservation_group_id)

**Backend:**
- `apps/api/src/lib/reservation-groups.ts`
- `apps/api/app/api/reservation-groups/route.ts`
- `apps/api/app/api/reservation-groups/[id]/route.ts`
- `apps/api/app/api/reservation-groups/suggest-tables/route.ts`

**Frontend:**
- `apps/backoffice/src/hooks/use-reservation-groups.ts`
- `apps/backoffice/src/hooks/use-reservation-groups.test.ts`
- `apps/backoffice/src/components/TableMultiSelect.tsx`
- `apps/backoffice/src/components/TableSuggestions.tsx`
- `apps/backoffice/src/features/reservation-calendar-page.tsx`
- `apps/backoffice/src/features/reservation-calendar-page.test.ts`

**Documentation:**
- `docs/API.md`

**Tracking:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Validation Evidence

**API Tests:**
```
# tests 410
# suites 76
# pass 409
# fail 0
# skipped 1
```

**Backoffice Tests:**
```
# tests 158
# suites 34
# pass 158
# fail 0
```

**Tests added during review fixes:**
- `use-reservation-groups.test.ts`: 10 tests (create, get, cancel success + error paths; Zod schema validation)
- `reservation-calendar-page.test.ts`: +3 tests (multi-table validation, empty-table rejection, customer-name in multi-table mode)

**Quality Gates:**
- ✅ TypeScript check passed (API + Backoffice)
- ✅ Build passed (API + Backoffice)
- ✅ Lint passed (API + Backoffice)
- ✅ All unit tests passing

### Known Limitations

1. **Multi-table editing:** Edit functionality only supports single-table updates; multi-table group edits would require additional scope

### Change Log

- 2026-03-20: Initial implementation of Large Party Reservation Groups feature
  - Database schema, shared types, backend repository, API endpoints
  - Frontend components and calendar page integration
  - Group cancellation and calendar display enhancements
  - Unit tests and API documentation

- 2026-03-20 (review fixes): All HIGH/MEDIUM AI-review findings resolved
  - Backend: tenant guard in availability check, group cancel now sets CANCELLED status
  - Migration: `0112` made fully rerunnable/idempotent with `information_schema` guards; `0113` rollback intentionally omitted by design
  - Frontend: suggestions auto-fetch via `useEffect`, empty results clear stale cards
  - Detail modal: shows all linked tables from group detail API
  - Hook tests: replaced placeholder mocks with real `fetch`-mocked behavior tests
  - Expanded calendar page tests for multi-table validation coverage

- 2026-03-20 (review fixes — Round 2): Race-condition hardening, tenant isolation, timezone policy
  - Backend TX: `createReservationGroupWithTables` now authoritative gate — locks selected tables with `FOR UPDATE`, rechecks overlaps inside same TX, no TOCTTOU window
  - Tenant isolation: group detail reservations query scoped to `company_id + outlet_id` from group row
  - Route error map: `"not available"` → 409 CONFLICT; `"requires at least 2"` → 400 INVALID_REQUEST
  - Timezone script: removed UTC fallback; only backfills where `company.timezone IS NOT NULL`
  - Deterministic tests: injectable `createReservationGroupFn` param; 5 new coverage tests for conflict, lock-failure, capacity, DELETE path
  - Docs: cancel behavior fully described (cancel → unlink → delete); 409 enumerates all protected statuses
  - Story: removed stale `0113` artifact references; documented intentional rollback deletion; file list includes one-time timezone script
