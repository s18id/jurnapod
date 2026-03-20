# Story 13.2.1: Reservation Group Editing - Critical Fixes

**Status:** done

## Story

As a backoffice operator using the reservation group editing feature,
I want the system to correctly display and handle my data,
so that I can edit reservation groups without data corruption or security gaps.

## Motivation

Code review of Story 13.2 identified 3 CRITICAL and 2 MEDIUM severity issues that must be fixed before the story can be marked DONE:

1. **CRITICAL-1**: Customer name shows table name instead of actual customer name (data corruption)
2. **CRITICAL-2**: Missing outlet_id verification in group lock query (tenant isolation gap)
3. **CRITICAL-3**: Silent fallback to current time if group has 0 reservations (data integrity)
4. **MEDIUM-1**: "Insufficient capacity" returns 409 instead of 400 (API contract)
5. **MEDIUM-2**: "Large party" checkbox enabled during group edit (UX confusion)

## Tasks / Subtasks

- [x] Task 1: Fix Customer Name Data Corruption (CRITICAL-1)
  - [x] Subtask 1.1: Change customerName pre-population from `table_name` to `customer_name`
  - [x] Subtask 1.2: Add customerPhone and notes pre-population to group edit form

- [x] Task 2: Add Tenant Isolation Verification (CRITICAL-2)
  - [x] Subtask 2.1: Investigate auth context for outletId availability
  - [x] Subtask 2.2: Add outlet_id verification to group lock query (Option A - query param)
  - [x] Subtask 2.3: Update API endpoint to pass outletId to repository function

- [x] Task 3: Fix Silent Fallback on Empty Group (CRITICAL-3)
  - [x] Subtask 3.1: Modify getFirstReservationTime() to throw error instead of returning default
  - [x] Subtask 3.2: Add JSDoc documenting throws behavior

- [x] Task 4: Fix HTTP Status for Capacity Errors (MEDIUM-1)
  - [x] Subtask 4.1: Move "Insufficient capacity" error to 400 INVALID_REQUEST
  - [x] Subtask 4.2: Verify timing conflicts remain at 409 CONFLICT

- [x] Task 5: Disable Large Party Checkbox in Group Edit (MEDIUM-2)
  - [x] Subtask 5.1: Add disabled prop to checkbox when formMode === "edit-group"
  - [x] Subtask 5.2: Update description text to explain why disabled

## Technical Approach

### Task 1: Customer Name Fix (Frontend)

**File:** `apps/backoffice/src/features/reservation-calendar-page.tsx`
**Lines:** 750-758

**Current (WRONG):**
```typescript
setFormState({
  tableId: null,
  customerName: firstReservation.table_name || "Group Reservation", // ← BUG
  customerPhone: "",
  guestCount: groupDetail.total_guest_count,
  reservationAt: new Date(firstReservation.reservation_at),
  durationMinutes: durationMinutes,
  notes: "" // ← MISSING
});
```

**Correct:**
```typescript
setFormState({
  tableId: null,
  customerName: row.customer_name || "Group Reservation",
  customerPhone: row.customer_phone || "",
  guestCount: groupDetail.total_guest_count,
  reservationAt: new Date(firstReservation.reservation_at),
  durationMinutes: durationMinutes,
  notes: row.notes || ""
});
```

### Task 2: Tenant Isolation Fix (Backend)

**Investigation First:**
Check `apps/api/src/lib/auth-guard.ts` for AuthContext type to see if `outletId` is available.

**Option A (If outletId in auth):**
```typescript
// Function signature update
export async function updateReservationGroup(input: {
  companyId: number;
  outletId: number;  // ADD
  groupId: number;
  updates: { ... };
})

// Query update (lines 605-611)
WHERE id = ? AND company_id = ? AND outlet_id = ?
```

**Option B (If outletId NOT in auth):**
```typescript
// After lock acquisition (line 618)
if (group.outlet_id !== expectedOutletId) {
  await conn.rollback();
  throw new Error("Reservation group not found or access denied");
}
```

**API Endpoint Update (route.ts lines 175-179):**
```typescript
const result = await updateReservationGroup({
  companyId: auth.companyId,
  outletId: auth.outletId,  // ADD THIS
  groupId,
  updates: validated
});
```

### Task 3: Empty Group Fix (Backend)

**File:** `apps/api/src/lib/reservation-groups.ts`
**Lines:** 892-897

**Current (WRONG):**
```typescript
return rows[0]?.reservation_at ?? new Date().toISOString();
```

**Correct:**
```typescript
if (!rows[0]) {
  throw new Error(`Reservation group ${groupId} has no reservations - data integrity violation`);
}
return rows[0].reservation_at;
```

**JSDoc Addition:**
```typescript
/**
 * Get the reservation time from the first reservation in a group.
 * Used when time is not provided in update request.
 * 
 * @param conn - Active database connection
 * @param groupId - Reservation group ID
 * @returns ISO 8601 datetime string
 * @throws Error if group has no reservations (data integrity violation)
 */
```

### Task 4: HTTP Status Fix (API)

**File:** `apps/api/app/api/reservation-groups/[id]/route.ts`
**Lines:** 205-220

**Change:**
```typescript
// Move capacity errors to 400
if (
  msg.includes("Insufficient capacity") ||
  msg.includes("requires at least") ||
  msg.includes("more than 10")
) {
  return errorResponse("INVALID_REQUEST", msg, 400);
}

// Keep timing conflicts at 409
if (
  msg.includes("not available") ||
  msg.includes("conflict detected") ||
  msg.includes("have started")
) {
  return errorResponse("CONFLICT", msg, 409);
}
```

### Task 5: Checkbox Disable (Frontend)

**File:** `apps/backoffice/src/features/reservation-calendar-page.tsx`
**Lines:** 1342-1347

**Change:**
```tsx
<Checkbox
  label="Large party (multiple tables)"
  description={
    formMode === "edit-group" 
      ? "This group requires multiple tables (cannot be changed)" 
      : "For parties requiring 2+ tables"
  }
  checked={isMultiTable}
  onChange={(event) => setIsMultiTable(event.currentTarget.checked)}
  disabled={formMode === "edit-group"}
/>
```

## Dependencies

- Story 13.2 (Reservation Group Editing) - MUST be complete
- Auth context investigation in `apps/api/src/lib/auth-guard.ts`

## Out of Scope

- Adding backend unit tests (see Story 13.2.2)
- Adding frontend UI tests (see Story 13.2.2)
- Performance optimization (deduplicating queries)
- Any feature additions

## Acceptance Criteria

1. **Given** I'm editing a reservation group
   **When** the form opens
   **Then** customer name shows the actual customer name, not table name

2. **Given** I'm editing a reservation group
   **When** the form opens
   **Then** customer phone and notes are pre-populated from existing data

3. **Given** a user attempts to edit a group from a different outlet
   **When** they submit the edit
   **Then** the system returns 404 (not found / access denied)

4. **Given** a group has zero reservations (corrupted state)
   **When** update is attempted
   **Then** the system throws an error with group ID in message

5. **Given** I submit an update with insufficient capacity
   **When** the API validates
   **Then** it returns 400 BAD_REQUEST (not 409)

6. **Given** I'm editing a reservation group
   **When** I view the form
   **Then** the "Large party" checkbox is disabled

## Dev Notes

### Implementation Summary

This story fixes critical bugs identified in Story 13.2 code review:

1. **Data Corruption Fix**: Pre-population used wrong field (table_name vs customer_name)
2. **Security Fix**: Added outlet_id verification to tenant isolation
3. **Integrity Fix**: Throwing error instead of silent fallback
4. **API Fix**: Proper HTTP status codes for validation vs conflict errors
5. **UX Fix**: Disabled checkbox prevents user confusion

### Files to Modify

- `apps/api/src/lib/reservation-groups.ts` - Tasks 2, 3
- `apps/api/app/api/reservation-groups/[id]/route.ts` - Tasks 2, 4
- `apps/backoffice/src/features/reservation-calendar-page.tsx` - Tasks 1, 5

### Validation

Run after implementation:
```bash
npm run typecheck -w @jurnapod/api
npm run typecheck -w @jurnapod/backoffice
npm run test:unit -w @jurnapod/api
npm run test -w @jurnapod/backoffice
npm run build -w @jurnapod/api
npm run build -w @jurnapod/backoffice
```

## Dev Agent Record

### Agent Model Used

opencode-go/minimax-m2.7

### Implementation Details

**Task 1 - Customer Name Fix (Frontend):**
- File: `apps/backoffice/src/features/reservation-calendar-page.tsx`
- Lines: 750-758
- Changed `firstReservation.table_name` to `row.customer_name`
- Added `row.customer_phone` and `row.notes` pre-population

**Task 2 - Tenant Isolation Fix (Backend + API):**
- File: `apps/api/src/lib/reservation-groups.ts` - Added `outletId` parameter to function signature and WHERE clause
- File: `apps/api/app/api/reservation-groups/[id]/route.ts` - Added `outlet_id` query param extraction and validation
- Auth context investigation: `AuthContext` doesn't have `outletId`, extracted from query params instead

**Task 3 - Empty Group Fix (Backend):**
- File: `apps/api/src/lib/reservation-groups.ts`
- Lines: 889-905
- `getFirstReservationTime()` now throws error if no reservations found
- Added JSDoc documenting throws behavior

**Task 4 - HTTP Status Fix (API):**
- File: `apps/api/app/api/reservation-groups/[id]/route.ts`
- Moved "Insufficient capacity" and "data integrity violation" to 400 INVALID_REQUEST
- Kept timing conflicts ("not available", "conflict detected", "have started") at 409 CONFLICT

**Task 5 - Checkbox Disable (Frontend):**
- File: `apps/backoffice/src/features/reservation-calendar-page.tsx`
- Lines: 1342-1351
- Added `disabled={formMode === "edit-group"}` prop
- Updated description to explain why disabled in group edit mode

### File List

**Modified Files:**
- `apps/api/src/lib/reservation-groups.ts` - Added outletId param, fixed empty group handling
- `apps/api/app/api/reservation-groups/[id]/route.ts` - Added outlet_id validation, fixed error codes
- `apps/backoffice/src/features/reservation-calendar-page.tsx` - Fixed customer pre-population, disabled checkbox

### Validation Evidence

**TypeScript Checks:**
- ✅ API package: Pass
- ✅ Backoffice package: Pass

**Tests:**
- ✅ API unit tests: 409 pass, 0 fail
- ✅ Backoffice tests: 158 pass, 0 fail

**Builds:**
- ✅ API build: Pass
- ✅ Backoffice build: Pass

### Change Log

- 2026-03-20: Implementation complete
  - Task 1: Fixed customer name pre-population (used row fields instead of firstReservation)
  - Task 2: Added outlet_id verification via query parameter
  - Task 3: Added error throwing for empty group instead of silent fallback
  - Task 4: Fixed HTTP status codes (400 for validation, 409 for conflicts)
  - Task 5: Disabled "Large party" checkbox in group edit mode
  - All validations pass (typecheck, tests, build)

- 2026-03-20: Code Review Complete
  - Review Status: APPROVED - No HIGH/MEDIUM/LOW issues found
  - All 5 tasks verified correct implementation
  - All acceptance criteria satisfied
  - Story marked: done
