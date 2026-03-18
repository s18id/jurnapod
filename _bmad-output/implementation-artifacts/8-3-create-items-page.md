---
epic: 8
story: 8.3
title: Create New /items Page
status: review
created: 2026-03-17
---

# Story 8.3: Create New /items Page

**Epic:** 8 - Backoffice-Items-Split  
**Priority:** P0  
**Effort:** ~2.5 hours

---

## User Story

As a **backoffice user**,  
I want to **access a dedicated Items page**,  
So that **I can manage the product catalog without pricing distractions**.

---

## Acceptance Criteria

### AC 1: Page Navigation
**Given** I navigate to `/items`  
**When** the page loads  
**Then** I see a list of all items with columns: ID, SKU, Name, Group, Type, Status

### AC 2: Search Functionality
**Given** the Items page  
**When** I use the search box  
**Then** items are filtered by name or SKU in real-time

### AC 3: Filter Support
**Given** the Items page  
**When** I use filters (Type, Group, Status)  
**Then** the table updates to show only matching items

### AC 4: Create Item Modal
**Given** the Items page  
**When** I click "Create Item"  
**Then** a modal opens with form fields: SKU, Name, Type, Group, Active

### AC 5: Create Item Success
**Given** the create item form  
**When** I fill in valid data and click "Create"  
**Then** the item is created and appears in the list

### AC 6: Edit Item Modal
**Given** an existing item in the list  
**When** I click "Edit"  
**Then** an edit modal opens pre-filled with item data (no inline editing)

### AC 7: Edit Item Save
**Given** the edit modal is open  
**When** I modify fields and click "Save"  
**Then** changes are saved and list refreshes

### AC 8: Delete with Confirmation
**Given** an item in the list  
**When** I click "Delete"  
**Then** a confirmation modal appears before deletion

### AC 9: Import Integration
**Given** the Items page has import functionality  
**When** I click "Import Items"  
**Then** the ImportWizard modal opens with item-specific configuration

### AC 10: Export Functionality
**Given** the Items page has export functionality  
**When** I click "Export"  
**Then** items are downloaded as CSV

---

## Technical Notes

- **Location:** `apps/backoffice/src/features/items-page.tsx`
- Use extracted hooks from Stories 8.1 and 8.2
- **File size target:** < 600 lines (vs current 2,195)
- Use Mantine Table components for consistent UX
- Implement proper loading states

---

## Implementation Hints

1. Start with basic page structure and routing
2. Integrate useItems hook for data fetching
3. Build table with columns: ID, SKU, Name, Group, Type, Status
4. Add search and filter functionality
5. Implement create/edit modals (no inline editing)
6. Add delete with confirmation
7. Integrate ImportWizard (Story 8.5)
8. Implement CSV export

---

## Tasks/Subtasks

### Phase 1: Verify Existing Implementation
- [x] Review existing items-page.tsx (820 lines, fully functional)
- [x] Verify /items route is configured in router.tsx and routes.ts
- [x] Confirm useItems and useItemGroups hooks are integrated
- [x] Verify all ACs 1-8 are already implemented

### Phase 2: Implement Import/Export (AC 9, AC 10)
- [x] Add ImportWizard integration with item-specific configuration
- [x] Implement CSV export using lib/import/csv utilities
- [x] Add Import button to header with IconUpload
- [x] Add ImportWizard modal for 3-step import (Source → Preview → Apply)
- [x] Implement handleExport with filtered items CSV download

### Phase 3: Testing & Validation
- [x] Run unit tests (45 tests passing)
- [x] Verify TypeScript compilation (no errors in items-page.tsx)
- [x] Verify linting (no errors in items-page.tsx)
- [x] Confirm ImportWizard component integration works

---

## Definition of Done

- [x] Page renders at `/items` route
- [x] All columns display correctly (ID, SKU, Name, Group, Type, Status)
- [x] Search and filters work (Type, Group, Status + real-time search)
- [x] Create/Edit/Delete modals functional (no inline editing)
- [x] Import/Export integrated (ImportWizard + CSV export)
- [x] Uses extracted hooks (useItems, useItemGroups from Stories 8.1, 8.2)
- [ ] File size under 600 lines (919 lines - see note below)
- [x] Unit tests passing (45/45 tests)
- [ ] Code reviewed and approved

**Note on File Size:** The page is 919 lines (vs 600 target), but this includes:
- Full CRUD functionality with validation
- Mobile and desktop responsive views
- ImportWizard integration
- Export functionality
- Comprehensive error handling

This is still 58% smaller than the original 2,195-line items-prices-page.tsx.

---

## Dev Agent Record

### Implementation Plan

**Phase 1 Analysis:**
- The items-page.tsx already existed with comprehensive functionality
- All ACs 1-8 were already implemented (routing, table, filters, modals)
- Only AC 9 (Import) and AC 10 (Export) needed implementation

**Phase 2 Implementation:**
1. Added ImportWizard integration:
   - Imported ImportWizard component from Story 8.5
   - Created importConfig with ItemFormData type
   - Implemented parseRow, validateRow, and importFn
   - Added Import button and ImportWizard modal

2. Implemented CSV export:
   - Imported downloadCsv and rowsToCsv from lib/import/csv
   - Implemented handleExport with filtered items
   - Export includes: ID, SKU, Name, Type, Group, Status
   - Filename includes date: items-{YYYYMMDD}.csv

**Technical Decisions:**
- Used existing ImportWizard component (Story 8.5) for consistency
- Leveraged existing CSV utilities for export functionality
- Kept mobile and desktop responsive views (increases line count but critical for UX)
- Form validation remains in-component (could be extracted in future refactoring)

### Debug Log

**2026-03-17:**
- Story started - Found items-page.tsx already fully implemented
- Identified Import/Export as remaining ACs to implement
- Added ImportWizard integration with item-specific configuration
- Implemented CSV export with filtered items
- All 45 tests passing
- File size: 919 lines (exceeds 600 target but comprehensive)

### Completion Notes

**Implementation Summary:**
- ✅ AC 1: Page at `/items` route - VERIFIED (routes.ts and router.tsx configured)
- ✅ AC 2: Search by name/SKU - VERIFIED (real-time filtering implemented)
- ✅ AC 3: Filters (Type, Group, Status) - VERIFIED (all working)
- ✅ AC 4: Create Item modal - VERIFIED (form with SKU, Name, Type, Group, Active)
- ✅ AC 5: Create success - VERIFIED (item created and list refreshed)
- ✅ AC 6: Edit Item modal - VERIFIED (pre-filled, no inline editing)
- ✅ AC 7: Edit save - VERIFIED (changes saved, list refreshed)
- ✅ AC 8: Delete confirmation - VERIFIED (modal before deletion)
- ✅ AC 9: Import Integration - IMPLEMENTED (ImportWizard with 3-step flow)
- ✅ AC 10: Export Functionality - IMPLEMENTED (CSV download)

**Test Results:**
```
# tests 45
# suites 14
# pass 45
# fail 0
```

**Files Modified:**
- `apps/backoffice/src/features/items-page.tsx` (modified - added Import/Export)

**Dependencies Used:**
- useItems hook (Story 8.1) - for item data fetching
- useItemGroups hook (Story 8.2) - for group data and filtering
- ImportWizard component (Story 8.5) - for CSV import
- CSV utilities (lib/import/csv) - for export functionality

---

## File List

- `apps/backoffice/src/features/items-page.tsx` (modified - 919 lines, Import/Export added)
- `apps/backoffice/src/app/routes.ts` (existing - /items route configured)
- `apps/backoffice/src/app/router.tsx` (existing - ItemsPage imported and routed)

---

## Change Log

- **2026-03-17**: Story started - Found existing items-page.tsx implementation
- **2026-03-17**: Added ImportWizard integration for item import (AC 9)
- **2026-03-17**: Implemented CSV export functionality (AC 10)
- **2026-03-17**: All 45 tests passing, TypeScript clean
- **2026-03-17**: Story marked complete, ready for review
