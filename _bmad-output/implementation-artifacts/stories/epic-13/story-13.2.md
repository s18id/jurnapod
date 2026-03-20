# Story 13.2: Reservation Group Editing (Multi-Table Updates)

Status: done

## Story

As a backoffice operator,
I want to edit existing reservation groups,
so that I can correct booking mistakes or accommodate guest changes without canceling and recreating the entire group.

## Acceptance Criteria

1. **Given** a reservation group exists
   **When** I click Edit on a grouped reservation
   **Then** the form opens in multi-table mode with existing tables pre-selected
   **And** I can modify customer name, phone, guest count, time, duration, and notes

2. **Given** I am editing a reservation group
   **When** I add or remove tables from the selection
   **Then** the system validates total capacity still meets guest count
   **And** shows an error if capacity is insufficient

3. **Given** I change the time/duration of a group
   **When** I submit the form
   **Then** the system checks for conflicts on all selected tables
   **And** rejects the update if any table has a conflicting reservation

4. **Given** group update validation passes
   **When** I submit the changes
   **Then** all reservations in the group are updated atomically
   **And** removed tables have their `reservation_group_id` set to NULL

5. **Given** I edit an individual reservation that belongs to a group
   **When** I open the edit form
   **Then** I see a notice "Part of Group #X" but can still edit this single reservation
   **And** individual edits do not affect other reservations in the group

## Tasks / Subtasks

- [x] Task 1: Backend Repository - `updateReservationGroup()` (AC: 1,2,3,4)
  - [x] Subtask 1.1: Add `updateReservationGroup()` function with atomic transaction
  - [x] Subtask 1.2: Implement table add/remove logic with capacity revalidation
  - [x] Subtask 1.3: Implement time/duration change with conflict detection
  - [x] Subtask 1.4: Handle removed tables (set `reservation_group_id = NULL`)
  - [x] Subtask 1.5: Add tenant scoping (`company_id` + `outlet_id` guards)

- [x] Task 2: API Endpoint - PATCH `/api/reservation-groups/[id]` (AC: 1,2,3,4)
  - [x] Subtask 2.1: Create `PATCH /api/reservation-groups/[id]` route handler
  - [x] Subtask 2.2: Add Zod validation for update request
  - [x] Subtask 2.3: Wire up `updateReservationGroup()` repository function
  - [x] Subtask 2.4: Add proper error mapping (400, 409, 404)
  - [x] Subtask 2.5: Add auth guards (roles: OWNER, ADMIN, ACCOUNTANT, CASHIER)

- [x] Task 3: Shared Types - `ReservationGroupUpdateRequest` Schema (AC: all)
  - [x] Subtask 3.1: Define `ReservationGroupUpdateRequestSchema` with optional fields
  - [x] Subtask 3.2: Support partial updates (only changed fields required)
  - [x] Subtask 3.3: Export type from shared index
  - [x] Subtask 3.4: Add to `ReservationGroupDetailSchema` if needed

- [x] Task 4: Frontend API Client Hook Updates (AC: all)
  - [x] Subtask 4.1: Add `updateReservationGroup()` function to hook
  - [x] Subtask 4.2: Add `ReservationGroupUpdateRequest` type import
  - [x] Subtask 4.3: Wire up `updateReservationGroup()` in `useReservationGroups` hook

- [x] Task 5: Frontend UI - Edit Form for Groups (AC: 1,2)
  - [x] Subtask 5.1: Detect when editing reservation with `reservation_group_id`
  - [x] Subtask 5.2: Pre-populate multi-table form with existing group data
  - [x] Subtask 5.3: Show "Editing Group #X" title in modal header
  - [x] Subtask 5.4: Pre-select existing tables in `TableMultiSelect` component
  - [x] Subtask 5.5: Pre-fetch suggestions based on current guest count

- [x] Task 6: Frontend UI - Individual Edit Notice (AC: 5)
  - [x] Subtask 6.1: Add "Part of Group #X" informational notice when editing individual reservation in group
  - [x] Subtask 6.2: Style notice with distinct visual (info badge, muted text)
  - [x] Subtask 6.3: Show which tables are in the group (read-only list)

- [ ] Task 7: Backend Tests (AC: all) - DEFERRED to Story 13.2.2
- [ ] Task 8: Frontend Tests (AC: all) - DEFERRED to Story 13.2.2

## Review Follow-ups (Code Review 2026-03-20)

### CRITICAL Issues (Resolved by Story 13.2.1)

- [x] [AI-Review][CRITICAL-1] Customer name pre-populated from `table_name` instead of `customer_name` [reservation-calendar-page.tsx:752] ✅ FIXED
- [x] [AI-Review][CRITICAL-2] Missing outlet_id verification in group lock query [reservation-groups.ts:605-611] ✅ FIXED
- [x] [AI-Review][CRITICAL-3] getFirstReservationTime() returns default instead of throwing on empty group [reservation-groups.ts:897] ✅ FIXED

### MEDIUM Issues (Resolved by Story 13.2.1)

- [x] [AI-Review][MEDIUM-1] "Insufficient capacity" returns 409 instead of 400 [route.ts:205-212] ✅ FIXED
- [x] [AI-Review][MEDIUM-2] "Large party" checkbox enabled during group edit [reservation-calendar-page.tsx:1342-1347] ✅ FIXED
- [ ] [AI-Review][MEDIUM-3] Duplicate getFirstReservationTime() calls (3x) - deferred to performance optimization
- [x] [AI-Review][MEDIUM-4] Missing customerPhone and notes pre-population - ✅ FIXED (part of CRITICAL-1 fix)

### LOW Issues (Nice to Have - Deferred)

- [ ] [AI-Review][LOW-1] Missing structured error logging context [route.ts:223]
- [ ] [AI-Review][LOW-2] Magic number 120 for duration - should extract constant
- [ ] [AI-Review][LOW-3] Missing JSDoc for getFirstReservationTime() - ✅ FIXED (added in 13.2.1)

## Technical Approach

### Backend Strategy

**`updateReservationGroup()` Function:**
```
Input: { companyId, groupId, updates: { customerName?, customerPhone?, guestCount?, reservationAt?, durationMinutes?, notes?, tableIds? } }

Transaction Steps:
1. Lock group row + all linked reservation rows (FOR UPDATE)
2. Validate group exists and belongs to company
3. If tableIds provided:
   a. Calculate removed tables (current - new)
   b. Unlink removed tables (set reservation_group_id = NULL)
   c. Validate new tables have capacity
   d. Add new tables as new reservation rows
4. If reservationAt/durationMinutes changed:
   a. Re-check conflicts for ALL tables (including new ones)
   b. Update reservation_start_ts and reservation_end_ts for all
5. Update group metadata (guest_count, etc.)
6. Commit transaction
```

**Conflict Detection:**
- Same overlap rule as create: `a_start < b_end && b_start < a_end`
- Lock all affected table rows before conflict check
- Re-check inside TX to eliminate TOCTTOU window

### Frontend Strategy

**Form Behavior:**
- When `editingReservation.reservation_group_id` is set:
  - Form mode = "edit-group"
  - Fetch full group detail via `getReservationGroup()`
  - Pre-populate all fields
  - Pre-select all tables in `TableMultiSelect`
  - Show group context in header
- When editing individual reservation in group (no group context):
  - Normal single-table edit
  - Show informational notice "This reservation is part of Group #X"
  - Does NOT change other reservations in group

### API Contract

**PATCH /api/reservation-groups/{id}**

Request:
```json
{
  "customer_name": "Updated Name",
  "customer_phone": "+1234567890",
  "guest_count": 12,
  "reservation_at": "2026-03-20T19:00:00+07:00",
  "duration_minutes": 150,
  "notes": "Updated notes",
  "table_ids": [1, 2, 3, 4]
}
```

Response (200 OK):
```json
{
  "success": true,
  "data": {
    "group_id": 123,
    "reservation_ids": [456, 457, 458, 459],
    "updated_tables": [1, 2, 3, 4],
    "removed_tables": [5]
  }
}
```

Errors:
- 400: Invalid input, insufficient capacity
- 404: Group not found
- 409: Conflict detected (time change creates overlap)
- 409: Non-cancellable status (ARRIVED, SEATED, etc.)

## Out of Scope

- Simultaneous time + table changes (do sequentially)
- Merging two groups
- Splitting a group into smaller groups
- Bulk group operations
- Editing reservations that are already ARRIVED, SEATED, COMPLETED, CANCELLED, NO_SHOW

## Dependencies

- Story 13.1 (Large Party Reservation Groups) - Must be complete
- Shared types from `packages/shared/src/schemas/reservation-groups.ts`
- Backend repository `apps/api/src/lib/reservation-groups.ts`
- Frontend hooks `apps/backoffice/src/hooks/use-reservation-groups.ts`
- Calendar page `apps/backoffice/src/features/reservation-calendar-page.tsx`

## Dev Notes

### Implementation Summary

This story completes the CRUD lifecycle for reservation groups by adding update capability.

**Key Design Decisions:**

1. **Atomic Updates:** All changes in group happen atomically - if any validation fails, entire update rolls back
2. **Table Changes as Add/Remove:** Instead of "moving" tables, we unlink removed ones and create new reservation rows for added ones
3. **Conflict Re-check on Time Change:** Even if just time changes, we re-validate all tables for conflicts
4. **Individual Edits Unaffected:** Editing one reservation in a group does NOT change other reservations (they share time, but can have independent metadata edits)
5. **No Group-Level Status:** Groups don't have a status - only individual reservations do

### References

- [Source: Story 13.1 - Large Party Reservation Groups]
- [Source: apps/api/src/lib/reservation-groups.ts - existing CRUD functions]
- [Source: apps/api/app/api/reservation-groups/[id]/route.ts - existing GET/DELETE]
- [Source: apps/backoffice/src/features/reservation-calendar-page.tsx - edit form]

## Dev Agent Record

### Agent Model Used

opencode-go/minimax-m2.7

### Debug Log References

- Backend repository function added following existing patterns from `createReservationGroupWithTables()`
- API endpoint follows existing GET/DELETE route patterns
- Frontend hook follows existing `createReservationGroup()` and `cancelReservationGroup()` patterns

### Completion Notes List

**Implementation Summary:**

1. **Task 1 - Backend Repository**: Added `updateReservationGroup()` function with:
   - Atomic transaction with FOR UPDATE locks
   - Table add/remove logic with capacity revalidation
   - Time/duration change with conflict detection
   - Removed tables unlinked via reservation_group_id = NULL
   - Tenant scoping via company_id + outlet_id guards

2. **Task 2 - API Endpoint**: Added PATCH `/api/reservation-groups/[id]` handler with:
   - Zod validation using ReservationGroupUpdateRequestSchema
   - Auth guards for OWNER, ADMIN, ACCOUNTANT, CASHIER roles
   - Error mapping: 400 (validation), 404 (not found), 409 (conflict)

3. **Task 3 - Shared Types**: Added `ReservationGroupUpdateRequestSchema` with:
   - All fields optional for partial updates
   - `table_ids` optional for table changes
   - `ReservationGroupUpdateResponseSchema` for response type

4. **Task 4 - Frontend Hook**: Added `updateReservationGroup()` function and updated `useReservationGroups` hook with:
   - `updateGroup()` method with loading/error states
   - Proper type imports

5. **Task 5 - Frontend UI**: Extended reservation form for group editing with:
   - Detection of `reservation_group_id` in openEditModal
   - Group data pre-population from `getReservationGroup()`
   - "Editing Group #X" modal title
   - Pre-selected tables in multi-table mode

6. **Task 6 - Individual Edit Notice**: Added "Part of Group #X" notice when editing individual reservation in a group with:
   - Violet/purple styled Alert component
   - List of other tables in the group
   - Clear messaging that individual edit does not affect group

### File List

**Modified Files:**
- `apps/api/src/lib/reservation-groups.ts` - Added `updateReservationGroup()` function (~330 lines)
- `apps/api/app/api/reservation-groups/[id]/route.ts` - Added PATCH handler (~100 lines)
- `packages/shared/src/schemas/reservation-groups.ts` - Added update schemas and types
- `apps/backoffice/src/hooks/use-reservation-groups.ts` - Added `updateReservationGroup()` and hook integration
- `apps/backoffice/src/features/reservation-calendar-page.tsx` - Extended form for group editing (~50 lines changes)

### Validation Evidence

**TypeScript Checks:**
- ✅ API package: Pass
- ✅ Shared package: Pass
- ✅ Backoffice package: Pass

**Tests:**
- ⚠️ Backend unit tests deferred (require DB fixtures) - See Story 13.2.2
- ⚠️ Frontend tests deferred (require DOM testing setup) - See Story 13.2.2

### Code Review Findings (2026-03-20)

**Status:** 3 CRITICAL + 2 MEDIUM issues found - Cannot mark DONE until Story 13.2.1 completes

| Issue | Severity | File:Line | Description |
|-------|----------|-----------|-------------|
| CRITICAL-1 | P1 | reservation-calendar-page.tsx:752 | customerName pre-populated from table_name |
| CRITICAL-2 | P1 | reservation-groups.ts:605-611 | Missing outlet_id in group lock query |
| CRITICAL-3 | P1 | reservation-groups.ts:897 | Silent fallback on empty group |
| MEDIUM-1 | P2 | route.ts:205-212 | Capacity error returns 409 not 400 |
| MEDIUM-2 | P2 | reservation-calendar-page.tsx:1342 | Large party checkbox not disabled |
| MEDIUM-3 | P3 | reservation-groups.ts | Duplicate getFirstReservationTime() calls |
| MEDIUM-4 | P2 | reservation-calendar-page.tsx:753 | Missing customerPhone/notes pre-pop |
| LOW-1 | P3 | route.ts:223 | Missing structured error logging |
| LOW-2 | P3 | reservation-groups.ts | Magic number 120 not extracted |
| LOW-3 | P3 | reservation-groups.ts:889 | Missing JSDoc on helper function |

**Follow-up Stories:**
- Story 13.2.1: Critical fixes for above P1/P2 issues
- Story 13.2.2: Test coverage (Tasks 7 & 8)

### Known Limitations

1. **No backend tests yet** - Unit tests for `updateReservationGroup()` need database fixtures
2. **No frontend tests yet** - UI component tests need Playwright/DOM setup
3. **No simultaneous time + table changes** - Per story spec, do sequentially
4. **Cannot merge/split groups** - Out of scope
5. **3 CRITICAL bugs pending fix** - See Story 13.2.1

### Change Log

- 2026-03-20: Initial implementation of reservation group editing feature
  - Backend: `updateReservationGroup()` with atomic TX, FOR UPDATE locks, conflict detection
  - API: PATCH endpoint with Zod validation and proper error mapping
  - Shared: `ReservationGroupUpdateRequestSchema` for type-safe partial updates
  - Frontend: Group edit form with pre-population, "Editing Group #X" title
  - Frontend: "Part of Group #X" notice for individual edits in groups
  - TypeScript validation passed across all packages
  - **⚠️ CODE REVIEW: 3 CRITICAL + 2 MEDIUM issues found - see Story 13.2.1**

- 2026-03-20: Code review completed
  - Identified 3 CRITICAL (data corruption, tenant isolation, empty group handling)
  - Identified 2 MEDIUM (API status code, UX checkbox)
  - Created Story 13.2.1 for critical fixes
  - Created Story 13.2.2 for test coverage
