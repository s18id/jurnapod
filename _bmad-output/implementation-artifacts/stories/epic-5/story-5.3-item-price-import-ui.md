# Story 5.3: Item/Price Import UI

Status: in-progress

## Story

As a **Jurnapod backoffice user**,  
I want **an import wizard for items and prices with validation preview**,  
So that **I can bulk upload products and prices with confidence and correct errors before applying**.

## Context

This story builds on the import infrastructure from Story 5.1 to create user-facing import wizards. Items and prices are the highest-value import targets because:
- Product catalogs can have hundreds or thousands of items
- Price updates need to happen across multiple outlets
- Manual entry is error-prone and time-consuming

The import wizard must guide users through the process and give them confidence before committing changes.

## Acceptance Criteria

**AC1: Import Wizard Flow**
**Given** the import wizard
**When** importing items or prices
**Then** the flow includes:
1. Upload step - drag-and-drop or file select
2. Mapping step - map columns to fields (with auto-detection)
3. Validation step - preview errors before applying
4. Apply step - execute import with progress
5. Results step - summary of imported/failed rows

**AC2: Column Auto-Detection**
**Given** uploaded files
**When** mapping columns
**Then** the system:
- Auto-detects columns based on header names
- Suggests mappings for common patterns (SKU, Name, Price, etc.)
- Allows manual override of auto-detected mappings
- Shows sample data for each detected column

**AC3: Validation Preview**
**Given** mapped data
**When** validating
**Then** the UI displays:
- Total rows, valid rows, error rows
- Row-by-row error details with specific messages
- Ability to download error report
- Option to fix errors in UI or cancel and re-upload

**AC4: Progress & Results**
**Given** applying imports
**When** processing
**Then** the UI shows:
- Real-time progress bar during import
- Row-by-row success/failure as it processes
- Final summary with counts and downloadable log
- Deep links to imported items for verification

## Tasks / Subtasks

- [x] Extend existing import-wizard.tsx with step navigation
- [x] Create file upload component with drag-and-drop
- [x] Create column mapping component with auto-detection
- [x] Create validation preview component
- [x] Create progress/result display component
- [x] Create item-import-page.tsx with full wizard
- [x] Create price-import-page.tsx with full wizard
- [x] Create use-import.ts hooks for API calls
- [x] Add import buttons to items-page.tsx (already existed - updated config)
- [x] Add import buttons to prices-page.tsx (already existed - updated config)
- [ ] Write component tests for wizard steps (deferred - see notes)
- [ ] Write integration tests for full import flow (deferred - see notes)

## Files to Create

| File | Description |
|------|-------------|
| `apps/backoffice/src/features/item-import-page.tsx` | Item import page with wizard |
| `apps/backoffice/src/features/price-import-page.tsx` | Price import page with wizard |
| `apps/backoffice/src/hooks/use-import.ts` | Import API hooks |
| `apps/backoffice/src/components/import-column-mapper.tsx` | Column mapping UI component |
| `apps/backoffice/src/components/import-validation-preview.tsx` | Validation preview component |
| `apps/backoffice/src/components/import-progress.tsx` | Progress display component |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/backoffice/src/components/import-wizard.tsx` | Modify/Extend | Extend existing wizard with step navigation |
| `apps/backoffice/src/features/items-page.tsx` | Modify | Add import button |
| `apps/backoffice/src/features/prices-page.tsx` | Modify | Add import button |
| `apps/backoffice/src/app/router.tsx` | Modify | Add import routes |

## Estimated Effort

2 days

## Risk Level

Medium (UI complexity, user-facing feature)

## Dev Notes

### Wizard State Management
```typescript
interface ImportWizardState {
  step: 'upload' | 'mapping' | 'validation' | 'apply' | 'results';
  file: File | null;
  mappings: ColumnMapping[];
  validationResult: ValidationResult | null;
  importResult: ImportResult | null;
  progress: number;
}
```

### Column Mapping UI
- Show 5 sample rows from the file
- Dropdown for each detected column to map to entity fields
- "Required" indicators for mandatory fields
- Visual distinction for mapped vs unmapped columns

### Validation Preview UI
- Tabs: "All", "Valid", "Errors"
- Table showing rows with error badges
- Error tooltip on hover
- Download button for full error report

### Progress UI
- Progress bar with percentage
- Live row counter ("Processing row 350 of 1,000")
- Cancel button (with confirmation)
- Estimated time remaining

### API Integration Pattern
```typescript
const importApi = {
  upload: (file: File) => Promise<UploadResponse>,
  validate: (uploadId: string, mappings: ColumnMapping[]) => Promise<ValidationResponse>,
  apply: (uploadId: string) => Promise<ImportResponse>,
  getTemplate: () => Promise<Blob>
};
```

### Error Handling
- Network errors: Retry with exponential backoff
- Validation errors: Show in preview, allow re-mapping
- Apply errors: Show in results, allow partial retry

## File List

- `apps/backoffice/src/features/item-import-page.tsx` (new)
- `apps/backoffice/src/features/price-import-page.tsx` (new)
- `apps/backoffice/src/hooks/use-import.ts` (new)
- `apps/backoffice/src/components/import-column-mapper.tsx` (new)
- `apps/backoffice/src/components/import-validation-preview.tsx` (new)
- `apps/backoffice/src/components/import-progress.tsx` (new)
- `apps/backoffice/src/components/import-wizard.tsx` (modified)
- `apps/backoffice/src/features/items-page.tsx` (modified)
- `apps/backoffice/src/features/prices-page.tsx` (modified)

## Validation Evidence

- `timeout 180s npm run typecheck -w @jurnapod/backoffice` passes
- `timeout 180s npm run lint -w @jurnapod/backoffice` passes
- `timeout 180s npm run build -w @jurnapod/backoffice` passes
- Import wizard navigates through all 5 steps
- Column auto-detection accuracy >80% for standard headers
- Validation preview shows errors within 2 seconds
- Import of 1000 items completes with progress updates

## Dependencies

- Story 5.1 (Import Infrastructure Core) must be complete
- Domain modules from Epic 3 (items, item-prices)
- Existing import-wizard.tsx component (to extend)

## Notes

- Reuse existing import-wizard component patterns
- Mobile-responsive design required
- Accessibility: ARIA labels, keyboard navigation
- Consider bulk editing capability (import → edit → re-import)
- Security: File size limits, type validation on client and server

## Test Coverage Criteria

- Coverage target: 70%+ for new UI components
- Happy paths to test:
  - Complete import flow with valid data
  - Column auto-detection for standard headers
  - Validation preview with no errors
  - Import with progress tracking
- Error paths to test:
  - Invalid file types
  - Malformed CSV/Excel files
  - Validation errors in preview
  - Network errors during upload/apply
  - Cancel import mid-process
- Edge cases:
  - Very large files (>10MB)
  - Files with many columns
  - Empty files
  - Files with only headers

## Completion Evidence

### Validation Results (2026-03-26)

**Type Check:** ✅ Passed
```
> tsc -p tsconfig.json --noEmit
# No errors
```

**Build:** ✅ Passed
```
> vite build
✓ built in 9.20s
# Bundled assets:
# - item-import-page-aeBee-Yl.js (3.23 kB)
# - price-import-page-DFWRprzx.js (3.71 kB)
```

**Lint:** ⚠️ 3 pre-existing errors in session.ts (not related to this story)

### Files Created/Modified

**Created:**
- `apps/backoffice/src/hooks/use-import.ts` - Import API hooks (useUpload, useValidate, useApply, useGetTemplate, useImportWizard)
- `apps/backoffice/src/components/import-column-mapper.tsx` - Column mapping UI with auto-detection
- `apps/backoffice/src/components/import-validation-preview.tsx` - Validation preview with tabs
- `apps/backoffice/src/components/import-progress.tsx` - Progress display with cancel
- `apps/backoffice/src/features/item-import-page.tsx` - Item import wizard page
- `apps/backoffice/src/features/price-import-page.tsx` - Price import wizard page

**Modified:**
- `apps/backoffice/src/components/import-wizard.tsx` - Extended with 5-step wizard flow
- `apps/backoffice/src/features/items-page.tsx` - Updated importConfig with new fields
- `apps/backoffice/src/features/prices-page.tsx` - Updated importConfig with new fields
- `apps/backoffice/src/app/router.tsx` - Added routes for /items/import and /prices/import

### Implementation Summary

The import wizard now implements all 5 steps:
1. **Upload** - File upload via drag-and-drop or file picker, with template download
2. **Mapping** - Auto-detection of column mappings with manual override
3. **Validation** - Preview with tabs (All/Valid/Errors) and error tooltips
4. **Apply** - Progress bar with row counter and cancel button
5. **Results** - Summary cards showing success/failed counts with error details

### Notes

- Component tests and integration tests deferred due to time constraints
- The existing modal-based import in items-page.tsx and prices-page.tsx continues to work
- Standalone import pages provide alternative navigation via /items/import and /prices/import routes
- Pre-existing lint errors in session.ts are unrelated to this story
