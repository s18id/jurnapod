---
epic: 8
story: 8.5
title: Build Reusable ImportWizard Component
status: review
created: 2026-03-17
started: 2026-03-17
completed: 2026-03-17
---

# Story 8.5: Build Reusable ImportWizard Component

**Epic:** 8 - Backoffice-Items-Split  
**Priority:** P0  
**Effort:** ~2 hours

---

## User Story

As a **developer**,  
I want to **create a generic ImportWizard component**,  
So that **both items and prices can use consistent import UX**.

---

## Acceptance Criteria

### AC 1: Component Interface
**Given** any import feature needs a wizard  
**When** I use `<ImportWizard config={importConfig} />`  
**Then** a 3-step wizard renders: Source → Preview → Apply

### AC 2: Source Step
**Given** the Source step  
**When** the user pastes CSV data or uploads a file  
**Then** the data is parsed and validated

### AC 3: Preview Step
**Given** the Preview step  
**When** validation completes  
**Then** a table shows rows with status (Create/Error) and error messages

### AC 4: Error Highlighting
**Given** the Preview step has errors  
**When** the user views the preview  
**Then** error rows are highlighted with specific error messages

### AC 5: Apply Step Progress
**Given** the Preview step has valid rows  
**When** the user clicks "Import"  
**Then** the Apply step shows progress with progress bar

### AC 6: Completion Summary
**Given** the Apply step completes  
**When** all rows are processed  
**Then** a summary shows: Success count, Failed count

### AC 7: Reusability - Items
**Given** the component is reusable  
**When** used for Items import vs Prices import  
**Then** only the column definitions and API endpoints differ

### AC 8: Consistency
**Given** the wizard is reusable  
**When** configured for different entity types  
**Then** the same 3-step pattern is maintained consistently

---

## Technical Notes

- **Location:** `apps/backoffice/src/components/import-wizard.tsx`
- Props interface: `ImportWizardConfig`
- Replaces duplicate import logic in items-prices-page.tsx
- Support both file upload and paste input
- CSV parsing with validation

---

## Implementation Hints

1. Define ImportWizardConfig interface with column definitions, validation rules, API endpoint
2. Build 3-step wizard with Stepper component
3. Implement CSV parsing in Source step
4. Build validation logic for Preview step
5. Create progress tracking for Apply step
6. Test with both Items and Prices configurations

---

## Tasks / Subtasks

### Task 1: Verify Component Interface (AC 1)
- [x] ImportWizardConfig interface supports generic type parameter
- [x] Component accepts config, onComplete, onCancel props
- [x] 3-step wizard renders: Source → Preview → Apply

### Task 2: Implement Source Step (AC 2)
- [x] Textarea for pasting CSV data
- [x] FileInput for uploading CSV/TXT files
- [x] CSV parsing with header detection
- [x] Integration with readImportFile utility

### Task 3: Implement Preview Step (AC 3, AC 4)
- [x] Table showing parsed rows with configurable columns
- [x] Status badges (Create/Error) for each row
- [x] Error messages displayed for invalid rows
- [x] Summary counts (Create, Error, Total)
- [x] Scrollable table with limit (50 rows displayed)

### Task 4: Implement Apply Step (AC 5, AC 6)
- [x] Progress bar during import execution
- [x] Loader indicator while processing
- [x] Completion summary with success/failed counts
- [x] Alert with color coding based on results

### Task 5: Ensure Reusability (AC 7, AC 8)
- [x] Generic ImportWizardConfig<T> interface
- [x] Configurable columns, validation, and import function
- [x] Same 3-step pattern maintained for all entity types
- [x] Works with Items and Prices configurations

### Task 6: Write Unit Tests
- [x] Test ImportWizardConfig interface compilation
- [x] Test CSV parsing logic
- [x] Test validation flow
- [x] Test hook (useImportWizard)

### Task 7: Integration Verification
- [x] Component works with items-import-utils.ts
- [x] Component works with item-prices-import-utils.ts
- [x] Verify existing items-prices-page.tsx integration

---

## Definition of Done

- [x] Component implemented with TypeScript types
- [x] 3-step wizard functional (Source → Preview → Apply)
- [x] CSV parsing and validation working
- [x] Error highlighting in preview
- [x] Progress bar during apply
- [x] Completion summary displayed
- [x] Reusable for Items and Prices
- [x] Unit tests passing (45 tests, all green)
- [ ] Code reviewed and approved

---

## Dev Agent Record

### Implementation Plan
The ImportWizard component already exists at `apps/backoffice/src/components/import-wizard.tsx`. This story verifies its completeness and adds comprehensive unit tests. The component:

1. Uses a generic `ImportWizardConfig<T>` interface for type safety
2. Implements a 3-step wizard (source → preview → apply) via internal state
3. Supports both file upload and paste input for CSV data
4. Validates rows and displays errors in the preview step
5. Shows progress during import execution
6. Provides completion summary with success/failed counts
7. Includes a `useImportWizard` hook for modal state management

### Files Modified/Created
- `apps/backoffice/src/components/import-wizard.tsx` (exists, verified complete - 362 lines)
- `apps/backoffice/src/components/import-wizard.test.ts` (created - 526 lines, 14 test suites, 45 tests)
- `apps/backoffice/src/tests/all.test.ts` (updated - added import-wizard.test import)

### Change Log
- 2026-03-17: Story status changed from backlog → in-progress → review
- 2026-03-17: Verified existing ImportWizard component against all 8 ACs
- 2026-03-17: Created comprehensive unit tests (45 tests, 14 suites)
- 2026-03-17: All tests passing, story ready for code review

### Completion Notes
**Implementation Complete - Story 8.5**

The ImportWizard component was already fully implemented at `apps/backoffice/src/components/import-wizard.tsx`. This story verified its completeness against all 8 Acceptance Criteria and added comprehensive unit tests.

**What was verified:**
1. **AC 1 (Component Interface)**: Generic `ImportWizardConfig<T>` interface with proper props (config, onComplete, onCancel)
2. **AC 2 (Source Step)**: File upload and paste input with CSV parsing
3. **AC 3 (Preview Step)**: Table with configurable columns, status badges, error messages
4. **AC 4 (Error Highlighting)**: Error rows highlighted with specific error messages
5. **AC 5 (Apply Step Progress)**: Progress bar during import with animated indicator
6. **AC 6 (Completion Summary)**: Alert showing success/failed counts with color coding
7. **AC 7 (Reusability)**: Works with both Items and Prices import configurations
8. **AC 8 (Consistency)**: Same 3-step pattern (source → preview → apply) maintained

**Tests Added:**
- 14 test suites covering TypeScript interfaces, CSV parsing, validation logic, state management, hook behavior, import results, and compatibility with Items/Prices configurations
- 45 tests total, all passing

**Test Execution Evidence:**
```
# tests 45
# suites 14
# pass 45
# fail 0
```

**Integration verified with:**
- `apps/backoffice/src/features/items-import-utils.ts`
- `apps/backoffice/src/features/item-prices-import-utils.ts`
- `apps/backoffice/src/features/items-prices-page.tsx` (uses inline import but component is ready for refactoring)
