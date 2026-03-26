# ADR-0010: Import/Export Framework Technical Debt

## Status
Accepted

## Context

During the implementation of Epic 5 (Import/Export Infrastructure), we built foundational frameworks for importing and exporting data in Stories 5.1 and 5.2. These frameworks provide:

- CSV and Excel file parsing/generation
- Row-level validation
- Batch processing with transactions
- Streaming exports for large datasets

While the frameworks are production-ready and meet current requirements, several technical debt items were identified during code review that should be documented for future remediation.

## Technical Debt Items

### TD-1: CSV Parsing Loads Entire File into Memory

**Location**: `apps/api/src/lib/import/parsers.ts` (lines 80-88)

**Issue**: The CSV parser converts the entire file buffer to a string and parses it synchronously:

```typescript
const fileContent = processedBuffer.toString(encoding as BufferEncoding);
const result = Papa.parse<string[]>(fileContent, {...});
```

**Impact**: Files approaching the 50MB limit will consume significant memory (~100-150MB during parsing).

**Mitigation**: 50MB file size limit is enforced.

**Resolution**: Implement true streaming CSV parsing using Node.js streams with Papa.parse stream mode.

**Priority**: Medium

---

### TD-2: Excel Parsing Loads Entire Workbook into Memory

**Location**: `apps/api/src/lib/import/parsers.ts` (lines 224-244)

**Issue**: The Excel parser loads the entire workbook before processing:

```typescript
const workbook = XLSX.read(file, { type: 'buffer', ... });
const sheetJson = XLSX.utils.sheet_to_json<string[]>(sheet, {...});
```

**Impact**: Excel files can consume 3-5x their file size in memory due to workbook structure.

**Mitigation**: 50MB file size limit enforced; Excel files compress well so actual data limits are higher.

**Resolution**: Use streaming Excel parsers (e.g., `xlsx-stream-reader`) for large files, or process sheets incrementally.

**Priority**: Medium

---

### TD-3: Excel Export Claims Streaming but Collects All Data

**Location**: `apps/api/src/lib/export/streaming.ts` (lines 78-88)

**Issue**: The Excel streaming function collects all rows into an array before writing:

```typescript
const allRows: T[] = [];
for await (const row of dataSource) {
  allRows.push(row);
  // ...
}
```

**Impact**: Excel exports of large datasets will cause memory issues despite "streaming" API.

**Mitigation**: Currently mitigated by processing in the main thread with progress callbacks.

**Resolution**: Implement chunked Excel generation with the `xlsx` library's streaming workbook API, or use a streaming Excel library like `exceljs`.

**Priority**: High (affects large exports)

---

### TD-4: Batch Processor Lacks Proper Context Passing

**Location**: `apps/api/src/lib/import/batch-processor.ts` (lines 68-71)

**Issue**: Company ID is hardcoded to 0 in the batch context:

```typescript
const context: BatchContext = {
  companyId: 0, // Will be set by caller
  startTime,
};
```

**Impact**: Actual import endpoints must override this; risk of tenant isolation bugs if forgotten.

**Mitigation**: Documentation clearly states this must be overridden.

**Resolution**: Make `companyId` required in `BatchOptions` or pass full context from caller.

**Priority**: High (security/tenant isolation concern)

---

### TD-5: Foreign Key Validation May Cause N+1 Queries

**Location**: `apps/api/src/lib/import/validator.ts` (lines 246-252 in types.ts)

**Issue**: The `validateForeignKeys` interface accepts rows and returns Promise<ImportError[]>, but batch validation processes rows sequentially:

```typescript
for (const row of rows) {
  const result = validator.validate(row, context);
  // ...
  if (validator.getDuplicateKey) { ... }
}
```

**Impact**: If FK validation queries the database per row, imports of 1000+ rows will generate 1000+ queries.

**Mitigation**: Currently not implemented in any validator; template pattern allows batch queries.

**Resolution**: Add batch FK validation helper that groups by table and queries with IN clauses.

**Priority**: Medium (only affects future validators)

---

### TD-6: No Resume/Checkpoint Capability for Interrupted Imports

**Location**: Entire import framework

**Issue**: If an import of 10,000 rows fails at row 8,000, the entire import must be restarted.

**Impact**: Large imports are risky; users lose time on partial failures.

**Mitigation**: Batch processing with transactions ensures partial batches don't commit; users get clear error counts.

**Resolution**: Implement import session persistence with checkpoint tracking. Allow resuming from last successful batch.

**Priority**: Low (can be addressed when needed)

---

### TD-7: Export Streaming Lacks Backpressure Handling

**Location**: `apps/api/src/lib/export/streaming.ts`

**Issue**: The streaming export yields buffers as fast as data is available without checking if consumer is ready:

```typescript
for await (const chunk of generateCSVStream(...)) {
  yield chunk;
}
```

**Impact**: Fast database queries could overwhelm slow HTTP responses, causing memory buildup.

**Mitigation**: HTTP responses typically handle backpressure; node streams have built-in buffering.

**Resolution**: Add explicit backpressure checking with `writable.write()` return values when piping to HTTP responses.

**Priority**: Low (theoretical issue, not observed)

---

### TD-8: No Progress Persistence for Long-Running Operations

**Location**: Entire import/export framework

**Issue**: Progress callbacks only exist in memory. If the server restarts during a large import, progress is lost.

**Impact**: Users cannot track long-running imports across server restarts.

**Mitigation**: Import sessions are tracked; can be extended to persist progress.

**Resolution**: Persist progress updates to database or Redis for import sessions.

**Priority**: Low (can be addressed when long-running imports become common)

## Decision

We accept these technical debt items because:

1. **Current Scale**: The 50MB file limit and 100-row batch size meet current requirements
2. **Time Constraints**: Epic 5 must complete to unblock dependent features
3. **Mitigation Exists**: File size limits and batch processing prevent production issues
4. **Clear Path**: Each TD item has a clear resolution path when requirements change

## Consequences

### Positive
- Framework delivered on schedule
- All current requirements met
- Extensible architecture allows TD remediation without breaking changes

### Negative
- Large file imports (>50MB) not supported without TD-1/TD-2 resolution
- Large Excel exports may cause memory pressure
- Import resume not available for partial failures
- Risk of N+1 queries if FK validation implemented carelessly

## Related Stories

- Story 5.1: Import Infrastructure Core
- Story 5.2: Export Infrastructure Core
- Story 5.3: Item/Price Import UI (depends on this framework)
- Story 5.4: Item/Price Export UI (depends on this framework)

## Notes for Future Implementers

When addressing technical debt:

1. **Start with TD-4** (Context Passing) - Security-critical
2. **TD-3** (Excel Streaming) - Required for large dataset support
3. **TD-1/TD-2** (Memory Usage) - Required for large file support
4. Maintain backward compatibility - existing imports should continue working
5. Add feature flags for new capabilities (resume, streaming Excel)

## References

- [Story 5.1: Import Infrastructure Core](../../_bmad-output/implementation-artifacts/stories/epic-5/story-5.1-import-infrastructure-core.md)
- [Story 5.2: Export Infrastructure Core](../../_bmad-output/implementation-artifacts/stories/epic-5/story-5.2-export-infrastructure-core.md)
- [PapaParse Documentation](https://www.papaparse.com/docs)
- [XLSX Library Documentation](https://docs.sheetjs.com/)
