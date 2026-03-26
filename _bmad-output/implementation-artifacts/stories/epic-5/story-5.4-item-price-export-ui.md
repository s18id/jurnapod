# Story 5.4: Item/Price Export UI

Status: ready-for-dev

## Story

As a **Jurnapod backoffice user**,  
I want **to export items and prices with filters and format options**,  
So that **I can download data for analysis, reporting, or bulk editing**.

## Context

This story builds on the export infrastructure from Story 5.2 to create user-facing export interfaces. Export is simpler than import (no complex validation, no wizard flow), but must handle filters and column selection elegantly.

Common use cases:
- Download item list for inventory audit
- Export prices for bulk price updates (edit in Excel, re-import)
- Create reports for management
- Backup data before bulk operations

## Acceptance Criteria

**AC1: Export Interface**
**Given** the items or prices page
**When** exporting
**Then** the UI provides:
- Export button with format selection (CSV, Excel)
- Column selection (all, default, custom)
- Filter application (current view filters apply)
- Date range selection for prices
- Preview of row count before export

**AC2: Column Selection**
**Given** export dialog
**When** selecting columns
**Then** the UI:
- Shows all available columns with descriptions
- Provides "Select All", "Select None", "Default Set" shortcuts
- Allows reordering of columns
- Remembers user preferences

**AC3: Export Execution**
**Given** export configuration
**When** generating
**Then** the UI:
- Shows loading state for large exports
- Streams/downloads file automatically
- Handles errors gracefully with retry option
- Names files with timestamp and filter info

## Tasks / Subtasks

- [ ] Create export dialog component
- [ ] Create column selector component
- [ ] Create format selector component
- [ ] Create use-export.ts hooks
- [ ] Add export button to items-page.tsx
- [ ] Add export button to prices-page.tsx
- [ ] Implement filter-to-export mapping
- [ ] Add download handling with progress
- [ ] Write component tests
- [ ] Write integration tests

## Files to Create

| File | Description |
|------|-------------|
| `apps/backoffice/src/components/export-dialog.tsx` | Export configuration dialog |
| `apps/backoffice/src/components/column-selector.tsx` | Column selection component |
| `apps/backoffice/src/components/format-selector.tsx` | Format selection component |
| `apps/backoffice/src/hooks/use-export.ts` | Export API hooks |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/backoffice/src/features/items-page.tsx` | Modify | Add export button and dialog |
| `apps/backoffice/src/features/prices-page.tsx` | Modify | Add export button and dialog |

## Estimated Effort

1.5 days

## Risk Level

Low (simpler than import, established patterns)

## Dev Notes

### Export Dialog Design
- Modal dialog with clear steps
- Column selector on left, preview on right
- Format selection at bottom
- Row count preview prominently displayed

### Column Selector UI
- Checkboxes for each column
- Drag-and-drop for reordering
- Search/filter for many columns
- Group related columns (e.g., "Pricing" group)

### Format Options
- CSV: Simple, universal
- Excel: Better formatting, multiple sheets support
- Future: JSON, PDF (out of scope for now)

### Filter Integration
```typescript
// Reuse existing filter state
const exportConfig = {
  filters: currentFilters, // From items/prices page
  columns: selectedColumns,
  format: 'csv' | 'xlsx',
  sort: currentSort
};
```

### File Naming Convention
```
jurnapod-items-{YYYY-MM-DD-HHmmss}.csv
jurnapod-prices-{outlet-code}-{YYYY-MM-DD}.xlsx
```

### Download Handling
- Use `URL.createObjectURL()` for client-side downloads
- Show toast notification on completion
- Handle browser popup blockers
- Support "download later" for very large exports (future)

## File List

- `apps/backoffice/src/components/export-dialog.tsx` (new)
- `apps/backoffice/src/components/column-selector.tsx` (new)
- `apps/backoffice/src/components/format-selector.tsx` (new)
- `apps/backoffice/src/hooks/use-export.ts` (new)
- `apps/backoffice/src/features/items-page.tsx` (modified)
- `apps/backoffice/src/features/prices-page.tsx` (modified)

## Validation Evidence

- `timeout 180s npm run typecheck -w @jurnapod/backoffice` passes
- `timeout 180s npm run lint -w @jurnapod/backoffice` passes
- `timeout 180s npm run build -w @jurnapod/backoffice` passes
- Export dialog opens and closes properly
- Column selection persists during session
- Export of 1000 items completes and downloads
- Export respects current filters

## Dependencies

- Story 5.2 (Export Infrastructure Core) must be complete
- Domain modules from Epic 3 (items, item-prices)
- Existing filter components on items/prices pages

## Notes

- Keep UI simple - export is simpler than import
- Consider adding "Quick Export" button with defaults
- Mobile-responsive design (dialog should work on mobile)
- Accessibility: focus management, ARIA labels
- Security: Respect user's data scope (company/outlet)

## Test Coverage Criteria

- Coverage target: 70%+ for new UI components
- Happy paths to test:
  - Export with default columns
  - Export with custom column selection
  - Export with filters applied
  - Export in both CSV and Excel formats
- Error paths to test:
  - Network errors during export
  - Empty result sets
  - Very large exports
  - Cancel export
- Edge cases:
  - Export with all columns
  - Export with no columns selected (validation)
  - Export while filters are loading

## Completion Evidence

To be filled after implementation:
- Screenshots of export dialog
- Test execution output
- Performance metrics
- Example exported files (sanitized)
