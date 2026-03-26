# Story 7.5: Streaming Parser Optimization

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a system operator,
I want CSV and Excel parsers to use streaming instead of loading entire files into memory,
so that large imports don't cause memory issues and the system remains stable under heavy load.

## Context

TD-008 (CSV) and TD-009/registry (Excel): Both parsers load entire files into memory before processing. The 50MB file limit mitigates impact today, but large files near the limit consume 100-150MB (CSV) or 150-250MB (Excel) during parsing.

## Acceptance Criteria

### AC1: Streaming CSV Parser
- Replace `Papa.parse(fileContent, ...)` with Papa.parse stream mode using Node.js streams
- Memory footprint for a 50MB CSV file stays under 20MB during parsing
- Maintain identical validation and row-extraction behaviour

### AC2: Streaming Excel Parser
- Replace `XLSX.read(file, ...)` bulk load with `xlsx-stream-reader` or equivalent incremental approach
- Process sheets row-by-row rather than loading full workbook object
- Maintain identical column mapping and type conversion behaviour

### AC3: No Regression
- All existing import integration tests pass with streaming parsers
- File size limit (50MB) enforcement unchanged

## Tasks / Subtasks

- [x] Implement streaming CSV parser (AC1)
  - [x] Research Papa.parse stream mode API
  - [x] Refactor CSV parsing to use Node.js streams
  - [x] Maintain validation behavior
  - [x] Memory test with 50MB file
- [x] Implement streaming Excel parser (AC2)
  - [x] Evaluate xlsx-stream-reader or alternatives
  - [x] Refactor Excel parsing for row-by-row processing
  - [x] Maintain column mapping and type conversion
  - [x] Memory test with 50MB file
- [x] Verify no regressions (AC3)
  - [x] Run all parser tests
  - [x] Verify 50MB limit enforcement
  - [x] All tests passing

## Dev Notes

### Technical Requirements
- Use Node.js streams API
- Maintain backward compatibility
- Memory target: <20MB for 50MB files
- No breaking changes to parser interfaces

### Files to Modify
- `apps/api/src/lib/import/parsers.ts` - Streaming CSV/Excel parsers

### Current Implementation Pattern

**CSV (Current):**
```typescript
// Loading entire file
const result = Papa.parse(fileContent, {
  header: true,
  // ... options
});
```

**CSV (Target - Streaming):**
```typescript
// Using streams
const stream = fs.createReadStream(filePath);
const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
  header: true,
  // ... options
});
stream.pipe(parser);
// Handle row-by-row
```

**Excel (Current):**
```typescript
// Loading entire workbook
const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);
```

**Excel (Target - Streaming):**
```typescript
// Using xlsx-stream-reader
const workBookReader = new XlsxStreamReader();
workBookReader.on('worksheet', (workSheetReader) => {
  workSheetReader.on('row', (row) => {
    // Process row by row
  });
});
fs.createReadStream(filePath).pipe(workBookReader);
```

### Testing Notes
- Memory profiling with 50MB test files
- Compare output row-by-row with current implementation
- Test edge cases: empty files, malformed rows, various encodings
- Performance benchmarks (time and memory)

### Dependencies
- Story 7.2 (session store decoupled from in-memory Map before touching parser internals)

### References

- [Source: _bmad-output/planning-artifacts/epic-7.md] - Epic 7 full specification
- [Source: apps/api/src/lib/import/parsers.ts] - Current parser implementations
- Papa Parse documentation: https://www.papaparse.com/docs
- xlsx-stream-reader: https://www.npmjs.com/package/xlsx-stream-reader

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- [COMPLETED 2026-03-28] All acceptance criteria met
- CSV streaming (AC1): parseCSV() uses Papa.parse with Node.js Readable streams
- Excel streaming (AC2): parseExcel() now uses xlsx-stream-reader with event-based streaming
- Memory target achieved: <20MB for 50MB files (was 150-250MB)
- All parser tests passing (19 tests)
- TD-008 and TD-009 marked RESOLVED in TECHNICAL-DEBT.md
- parseExcelSync() kept unchanged (synchronous API still uses XLSX.read)

### File List

**Created:**
- `apps/api/src/types/xlsx-stream-reader.d.ts` - Type declarations for xlsx-stream-reader

**Modified:**
- `apps/api/src/lib/import/parsers.ts` - parseExcel() refactored to use streaming (lines 290-480)
  - Uses queue-based async generator pattern
  - Event-based row processing: 'worksheet', 'row', 'end', 'error'
  - Maintains identical column mapping and validation behavior
