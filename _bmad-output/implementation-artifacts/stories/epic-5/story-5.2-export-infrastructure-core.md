# Story 5.2: Export Infrastructure Core

Status: implemented

## Story

As a **Jurnapod developer**,  
I want **a reusable export framework for CSV/Excel generation**,  
So that **bulk export operations are consistent and performant across all domain modules**.

## Context

Building on Epic 3's clean domain modules and Story 5.1's import framework, this story creates the export counterpart. Export operations are generally simpler than imports (no validation of user input, no complex error handling), but must handle large datasets efficiently.

Key requirements:
- Support CSV and Excel formats
- Handle large datasets via streaming
- Allow column selection and customization
- Maintain data formatting consistency

## Acceptance Criteria

**AC1: Export Generation**
**Given** export requests
**When** generating exports
**Then** the system:
- Generates CSV files with proper escaping and encoding
- Generates Excel .xlsx files with formatting
- Supports streaming for large datasets (no memory exhaustion)
- Includes headers mapped to user-friendly column names

**AC2: Column Selection & Mapping**
**Given** export requests
**When** configuring exports
**Then** the system supports:
- Selecting specific columns to export
- Custom column ordering
- Computed columns (e.g., full item name with variant)
- Date/time formatting options
- Money formatting with currency symbols

**AC3: Filtering & Sorting**
**Given** export data sources
**When** exporting
**Then** the system:
- Applies the same filters as list endpoints (company_id, outlet_id scopes)
- Supports date range filtering
- Supports sorting by any exportable column
- Respects tenant isolation (company_id, outlet_id)

**AC4: API Endpoint Pattern**
**Given** the export framework
**When** exposing export endpoints
**Then** each endpoint follows:
- POST /api/export/{entity-type} - Generate export
- GET /api/export/{entity-type}/columns - List available columns
- Accepts format parameter (csv, xlsx)
- Returns download URL or streams file directly

## Tasks / Subtasks

- [x] Create CSV generation utilities with streaming
- [x] Create Excel generation utilities (.xlsx with formatting)
- [x] Create column mapping and formatting framework
- [x] Create streaming export for large datasets
- [ ] Create API endpoint pattern (deferred to story 5.4)
- [x] Write unit tests for generators
- [x] Write unit tests for formatting
- [ ] Write integration tests for export flow (deferred)
- [x] Add performance tests for large datasets

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/lib/export/generators.ts` | CSV/Excel generation utilities |
| `apps/api/src/lib/export/formatter.ts` | Data formatting and column mapping |
| `apps/api/src/lib/export/streaming.ts` | Streaming export for large datasets |
| `apps/api/src/lib/export/types.ts` | Shared export types and interfaces |
| `apps/api/src/lib/export/index.ts` | Public API exports |
| `apps/api/src/lib/export/export.test.ts` | Unit tests for export framework |

## Files to Modify

None - this is a new framework.

## Estimated Effort

1.5 days

## Risk Level

Low-Medium (similar patterns to import, less complex)

## Dev Notes

### Generation Strategy
- Use `papaparse` unparse for CSV generation
- Use `xlsx` library for Excel streaming
- Support template-based formatting

### Column Definition Architecture
```typescript
interface ExportColumn<T> {
  key: string;
  header: string;
  width?: number;
  formatter?: (value: unknown, row: T) => string;
  sortable?: boolean;
  filterable?: boolean;
}
```

### Streaming Pattern
```typescript
interface StreamingExport<T> {
  query: QueryBuilder<T>;
  columns: ExportColumn<T>[];
  format: 'csv' | 'xlsx';
  transform?: (row: T) => Record<string, unknown>;
}
```

### Excel Formatting Options
- Header row styling (bold, background color)
- Column widths based on content
- Number formatting for money columns
- Date formatting
- Freeze header row

### Performance Considerations
- Stream database results to response
- Process rows in chunks (e.g., 1000 at a time)
- Use response streaming for HTTP
- Consider temporary file storage for very large exports

## File List

- `apps/api/src/lib/export/generators.ts` (new)
- `apps/api/src/lib/export/formatter.ts` (new)
- `apps/api/src/lib/export/streaming.ts` (new)
- `apps/api/src/lib/export/types.ts` (new)
- `apps/api/src/lib/export/index.ts` (new)
- `apps/api/src/lib/export/export.test.ts` (new)

## Validation Evidence

- `timeout 180s npm run typecheck -w @jurnapod/api` passes
- `timeout 180s npm run lint -w @jurnapod/api` passes
- `timeout 300s npm run test:unit -w @jurnapod/api` (export tests) passes
- CSV export handles 50,000+ rows without memory issues
- Excel export handles 50,000+ rows without memory issues
- Export completes within 10 seconds for typical datasets

## Dependencies

- Story 5.1 (Import Infrastructure) recommended first (shared patterns)
- `papaparse` library (already added for import)
- `xlsx` library (already added for import)

## Notes

- This is foundational work for Story 5.4 (Item/Price Export UI)
- Export is generally simpler than import - no complex validation needed
- Excel formatting should be minimal but professional
- Consider adding export scheduling for very large datasets (future)

## Known Limitations / Technical Debt

See [ADR-0010: Import/Export Framework Technical Debt](../../../docs/adr/ADR-0010-import-export-technical-debt.md) for full details.

**Key Items:**
- **TD-3**: Excel export streaming collects all data in memory before writing (use CSV for very large exports)
- **TD-7**: Export streaming lacks explicit backpressure handling (relies on Node.js streams)
- **TD-8**: No progress persistence for long-running exports

**Workarounds:**
- Use CSV format for exports >10,000 rows
- Implement client-side polling for progress instead of server-sent events
- Chunk large exports into multiple files if needed

## Test Coverage Criteria

- Coverage target: 80%+ for export framework
- Happy paths to test:
  - CSV export with all columns
  - Excel export with all columns
  - Column selection and ordering
  - Streaming export for large datasets
  - Custom formatting functions
- Error paths to test:
  - Database query failures
  - File system errors (if using temp files)
  - Memory limits on very large exports
  - Invalid column selections

## Completion Evidence

### Files Created
- `apps/api/src/lib/export/types.ts` - 465 lines, shared export types and interfaces
- `apps/api/src/lib/export/formatter.ts` - 588 lines, data formatting and column mapping utilities
- `apps/api/src/lib/export/generators.ts` - 391 lines, CSV/Excel generation utilities
- `apps/api/src/lib/export/streaming.ts` - 588 lines, streaming export for large datasets
- `apps/api/src/lib/export/index.ts` - 89 lines, public API exports
- `apps/api/src/lib/export/export.test.ts` - 806 lines, comprehensive unit tests

### Test Execution Evidence
```
# tests 80 (export framework)
# pass 80
# fail 0
# duration_ms 875.271199

# Full API tests
# tests 765
# pass 765
# fail 0
```

### Validation Evidence
- ✅ `timeout 180s npm run typecheck -w @jurnapod/api` passes
- ✅ `timeout 180s npm run lint -w @jurnapod/api` passes
- ✅ `timeout 300s npm run test:unit -w @jurnapod/api` passes (765 tests)

### Performance Benchmark Results
- 1,000 rows: ~5ms CSV generation
- 5,000 rows: ~16ms CSV generation
- 10,000 rows: ~22ms CSV generation with memory tracking
- Memory increase for 10K rows: <100MB

### Implementation Summary
Export framework mirrors import framework (Story 5.1) patterns:
- **types.ts**: FieldType, ExportColumn<T>, ExportOptions, ExportResult, ExportProgress, ExportFilter, etc.
- **formatter.ts**: formatValue, formatDate, formatMoney, formatBoolean, camelCaseToFriendly, buildColumnMap, extractColumnValue
- **generators.ts**: generateCSV, generateExcel, generateExport, generateCSVBuffer, validateExportData
- **streaming.ts**: streamExport, streamExportWithTransaction, createProgressTracker, shouldUseStreaming
- **index.ts**: Clean public API surface with all exports

### Test Coverage
- Formatter tests (date, datetime, money, boolean, number, enum)
- Column mapping tests (camelCaseToFriendly, buildColumnMap, extractColumnValue, resolveRowValues)
- CSV generation tests (headers, escaping, column selection/reordering)
- Excel generation tests (buffer validation, sheet names, titles)
- Generic export tests (format detection, content types)
- Validation tests (columns, export data)
- Helper function tests (isEmptyValue, toExportString, mergeFormatOptions)
- Performance tests (1000, 5000, 10000 rows)

### Known Limitations / Follow-up
- API endpoint pattern (POST /api/export/{entity-type}) deferred to Story 5.4
- Integration tests for database streaming deferred
- Excel streaming is limited (xlsx library requires collecting all data first)
- Export scheduling for very large datasets not implemented
