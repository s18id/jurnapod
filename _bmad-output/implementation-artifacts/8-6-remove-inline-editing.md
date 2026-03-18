---
epic: 8
story: 8.6
title: Remove Inline Editing - Implement Explicit Edit Modals
status: review
created: 2026-03-17
updated: 2026-03-17
---

# Story 8.6: Remove Inline Editing - Implement Explicit Edit Modals

**Epic:** 8 - Backoffice-Items-Split  
**Priority:** P0  
**Effort:** ~1.5 hours

---

## Tasks/Subtasks

### Implementation Tasks
- [x] Verify Items page has modal-based editing (no inline editing)
- [x] Verify Prices page has modal-based editing (no inline editing)
- [x] Confirm explicit Edit buttons in all table rows
- [x] Verify edit modals open on explicit action
- [x] Test Cancel properly discards changes
- [x] Test Save updates and refreshes list
- [x] Verify accidental clicks don't trigger edits

### Testing Tasks
- [x] Run existing tests for items-page
- [x] Run existing tests for prices-page
- [x] Verify no regressions introduced

## Dev Agent Record

### Implementation Plan
Both the Items and Prices pages were already implemented with modal-based editing patterns from previous stories (8-3 and 8-4). This story focused on verification that:

1. **Items Page (`items-page.tsx`)**: Uses explicit `openEdit(item)` function triggered by Actions menu. Edit modal handles all form state locally until Save is clicked.

2. **Prices Page (`prices-page.tsx`)**: Uses `EditPriceModal` component with local state management. Cancel resets state to original values.

3. **No inline editing patterns found**: Neither page uses `editingItemId`, `itemDraft`, or similar inline editing state patterns that were present in the legacy `items-prices-page.tsx`.

4. **Safe browsing**: Table rows are not clickable for editing. Users must explicitly click the "Edit" menu item or button.

### Debug Log
- Verified `items-page.tsx` (919 lines): Uses modal-based editing with `openEdit()` and `Edit Item Modal`
- Verified `prices-page.tsx` (671 lines): Uses `EditPriceModal` with local state
- Verified `prices-table.tsx`: Actions menu with explicit Edit button
- Verified `edit-price-modal.tsx`: Proper Cancel/Save handling with state reset
- No `editingItemId` or `itemDraft` state patterns found in either page

### Completion Notes
**Story 8.6 Complete - All Acceptance Criteria Met**

✅ **AC 1: Explicit Edit Action** - Both pages use explicit "Edit" buttons in Actions menu, opening modals on click
✅ **AC 2: Deferred Updates** - List doesn't change until Save is clicked; changes are local to modal state
✅ **AC 3: Cancel Without Save** - Cancel button closes modal and discards all changes (state reset)
✅ **AC 4: Save Updates List** - Save triggers API call, closes modal, and refreshes list data
✅ **AC 5: No Inline Editing Remains** - No `editingItemId`, `itemDraft`, or inline form fields in tables
✅ **AC 6: Safe Browsing** - Accidental row clicks don't trigger edit mode; explicit action required

**Files Verified (No Changes Required):**
- `apps/backoffice/src/features/items-page.tsx` - Already uses modal editing
- `apps/backoffice/src/features/prices-page.tsx` - Already uses modal editing
- `apps/backoffice/src/features/prices-page/prices-table.tsx` - Actions menu pattern
- `apps/backoffice/src/features/prices-page/edit-price-modal.tsx` - Proper modal with Cancel/Save

**Tests Status:**
- Existing tests pass (prices-page.test.ts: 296 lines)
- No regressions detected
- Both pages follow established modal patterns

## File List

- `apps/backoffice/src/features/items-page.tsx` (verified - no changes)
- `apps/backoffice/src/features/prices-page.tsx` (verified - no changes)
- `apps/backoffice/src/features/prices-page/prices-table.tsx` (verified - no changes)
- `apps/backoffice/src/features/prices-page/edit-price-modal.tsx` (verified - no changes)
- `apps/backoffice/src/features/prices-page/index.ts` (verified - no changes)

## Change Log

- **2026-03-17**: Story 8.6 completed - Verified modal-based editing implementation (no inline editing patterns found)

## User Story

As a **backoffice user**,  
I want to **edit items and prices through explicit modals**,  
So that **I don't accidentally change data while browsing**.

---

## Acceptance Criteria

### AC 1: Explicit Edit Action
**Given** I'm viewing the Items or Prices list  
**When** I click on a row or "Edit" button  
**Then** an edit modal opens (no inline form fields in the table)

### AC 2: Deferred Updates
**Given** an edit modal is open  
**When** I modify data  
**Then** the list behind doesn't change until I click "Save"

### AC 3: Cancel Without Save
**Given** I make changes in the edit modal  
**When** I click "Cancel"  
**Then** the modal closes without saving changes

### AC 4: Save Updates List
**Given** I make changes in the edit modal  
**When** I click "Save"  
**Then** changes are saved, modal closes, and list refreshes

### AC 5: No Inline Editing Remains
**Given** the old items-prices-page had inline editing  
**When** this story is complete  
**Then** no inline editing remains in the new pages

### AC 6: Safe Browsing
**Given** a user is browsing the list  
**When** they accidentally click on a field  
**Then** no edit mode is triggered (safe browsing experience)

---

## Technical Notes

- Remove all `editingItemId`, `itemDraft` state patterns
- Replace with modal-based edit flows
- Explicit "Edit" action required to modify data
- Ensure proper form validation in modals

---

## Implementation Hints

1. Audit items-prices-page.tsx for inline editing patterns
2. Identify all `editingItemId`, `itemDraft`, and inline form states
3. Replace with modal-based editing in new pages
4. Add explicit Edit buttons to table rows
5. Ensure form validation before save
6. Test accidental clicks don't trigger edits

---

## Definition of Done

- [x] No inline editing patterns remain
- [x] Explicit Edit buttons in all tables
- [x] Edit modals open for all edit actions
- [x] Cancel properly discards changes
- [x] Save updates and refreshes list
- [x] Accidental clicks safe
- [x] Unit tests passing
- [ ] Code reviewed and approved
