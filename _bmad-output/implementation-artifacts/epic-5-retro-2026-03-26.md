# Epic 5 Retrospective: Import/Export Infrastructure

**Date:** 2026-03-26
**Epic:** Epic 5 — Import/Export Infrastructure
**Status:** Complete

---

## Context

Epic 5 built foundational import/export frameworks enabling bulk data operations for items, prices, and eventually other master data entities. The epic comprised four stories (5.1–5.4) spanning:

- **Story 5.1**: Import Infrastructure Core — CSV/Excel parsing, validation framework, batch processing
- **Story 5.2**: Export Infrastructure Core — CSV/Excel generation, streaming exports, column mapping
- **Story 5.3**: Item/Price Import UI — Import wizard with column mapping and validation preview
- **Story 5.4**: Item/Price Export UI — Export dialog with format/column selection

All stories completed with 765/765 API unit tests passing. Export API endpoint (`POST /api/export/:entityType`, `GET /api/export/:entityType/columns`) was added to complete the feature.

---

## What Went Well

| Area | Detail |
|------|--------|
| **Framework extensibility** | The import/export frameworks in `lib/import/` and `lib/export/` were designed with clear interfaces allowing new entity types to be added without modifying core code |
| **Technical debt awareness** | ADR-0010 was created early in development, documenting all known technical debt items. Two high-priority items (TD-3, TD-4) were resolved during the epic |
| **Batch processing safety** | Transactional batch processing ensures partial failures don't corrupt data. Each batch commits independently |
| **Streaming export for large datasets** | Implemented chunked Excel generation (10K rows/sheet) with 50K row limit and CSV recommendation for larger datasets |
| **Tenant isolation enforcement** | Company ID is now a required field in BatchOptions, eliminating risk of accidental cross-tenant data access |
| **UI/UX patterns** | Import wizard and export dialog follow established Mantine component patterns, reducing learning curve |
| **API documentation** | Export endpoints fully documented in `docs/API.md` with query parameters, response formats, and column listings |

---

## What Did Not Go Well

| Area | Detail |
|------|--------|
| **Export API endpoint gap** | Story 5.4 relied on export infrastructure from 5.2, but the actual API endpoint (`POST /api/export/:entityType`) was not created until after code review identified the gap. This was caught late in the process |
| **Story status tracking** | Sprint-status.yaml showed Story 5.3 and 5.5 as `done` when they were actually `in-progress`. Required manual reconciliation |
| **Integration test gaps** | Stories 5.1–5.4 deferred integration tests, focusing on unit tests. Full end-to-end import/export flows remain untested at the API level |
| **Date range implementation** | Initial implementation used `toISOString()` which shifts dates by timezone offset. Required fix to use local date components |
| **React state timing bug** | Date range filters were set via `setFilters()` but `executeExport()` ran before the state update completed. Required refactoring to pass override filters directly |

---

## Lessons Learned

1. **Infrastructure stories must include API endpoints**  
   When a story claims to provide "API endpoint pattern," the actual endpoint implementation must be included or clearly marked as a dependency on another story. Gap detection should happen in sprint planning, not code review.

2. **State management in export hooks needs explicit patterns**  
   The `overrideFilters` pattern (passing override parameters directly to the export function rather than relying on state updates) should be documented as a standard pattern for hooks that perform async operations based on form state.

3. **Story status should be verified against implementation**  
   Sprint-status.yaml accuracy depends on manual updates. A lightweight check (e.g., verifying story file status matches git commit presence) would catch discrepancies earlier.

4. **Date/time handling requires explicit timezone strategy**  
   Using `toISOString()` for user-facing date selection is a common mistake. The project should establish a convention: user-selected dates are local, storage/transfer uses ISO 8601 with explicit timezone, and display formatting happens at the presentation layer.

5. **Integration tests should be part of framework epics**  
   Deferring integration tests for infrastructure stories creates gaps that compound. Even basic API-level integration tests (upload → validate → import flow) should be included.

---

## Technical Debt

Technical debt items are documented in [ADR-0010: Import/Export Framework Technical Debt](../docs/adr/ADR-0010-import-export-technical-debt.md).

### Summary of TD Items

| TD | Description | Priority | Status |
|----|-------------|----------|--------|
| TD-1 | CSV parsing loads entire file into memory | Medium | Open |
| TD-2 | Excel parsing loads entire workbook into memory | Medium | Open |
| TD-3 | Excel export memory issues for large datasets | High | **RESOLVED** |
| TD-4 | Batch processor hardcoded companyId=0 | High | **RESOLVED** |
| TD-5 | FK validation may cause N+1 queries | Medium | Open |
| TD-6 | No resume/checkpoint for interrupted imports | Low | Open |
| TD-7 | Export streaming lacks backpressure handling | Low | Open |
| TD-8 | No progress persistence for long-running operations | Low | Open |

---

## Follow-Up Actions

### P1 — Address Before Next Import/Export Feature

| Action | Owner | Description | Success Criteria |
|--------|-------|-------------|-----------------|
| Add integration tests for import/export API | QA | Write API-level integration tests covering: upload → validate → apply flow for items and prices | Minimum 80% coverage of import/export endpoints; all tests pass |
| Create export API endpoint story dependency checklist | SM | Document which stories require which API endpoints; add to story template | Checklist in `docs/process/`; template updated |

### P2 — Address Within Next Sprint

| Action | Owner | Description | Success Criteria |
|--------|-------|-------------|-----------------|
| Add row-count preview before export (AC1) | Dev | Story 5.4 AC1 mentioned preview but UI shows estimated count from existing filters only | UI displays accurate row count before export begins |
| Add column reordering in export UI (AC2) | Dev | Story 5.4 AC2 specified reordering but only checkbox selection was implemented | Drag-and-drop column reordering working; order reflected in export |
| Add retry option on export errors (AC3) | Dev | Story 5.4 AC3 specified retry option for export failures | Error state shows retry button; retry resumes from beginning |

### P3 — Address When Capacity Allows

| Action | Owner | Description | Success Criteria |
|--------|-------|-------------|-----------------|
| Implement streaming CSV parsing (TD-1) | Dev | Replace synchronous file-to-string with Papa.parse stream mode | Memory usage stays constant regardless of file size |
| Implement streaming Excel parsing (TD-2) | Dev | Replace `XLSX.read()` with `xlsx-stream-reader` or incremental sheet processing | Memory usage proportional to current sheet size |
| Add import session checkpoint/resume (TD-6) | Dev | Persist import sessions to database; allow resuming from last successful batch | Interrupted import of 10K rows resumes at batch boundary |

---

## Conclusion

Epic 5 delivered foundational import/export infrastructure enabling bulk operations for master data. The frameworks are production-ready for current scale (files ≤50MB, exports ≤50K rows). Two high-priority security/performance issues (TD-3, TD-4) were resolved during development.

Key remaining gaps are in testing coverage and UI completeness (column reordering, row count preview, retry on errors). These should be addressed in a follow-up sprint before the import/export features are promoted to critical business workflows.

The epic is considered **successfully closed** from a retrospective standpoint. Technical debt items are documented in ADR-0010 with clear resolution paths.

---

## Related Documentation

- [ADR-0010: Import/Export Framework Technical Debt](../docs/adr/ADR-0010-import-export-technical-debt.md)
- [API.md - Export Endpoints](../docs/API.md#export)
- [Story 5.1: Import Infrastructure Core](../_bmad-output/implementation-artifacts/stories/epic-5/story-5.1-import-infrastructure-core.md)
- [Story 5.2: Export Infrastructure Core](../_bmad-output/implementation-artifacts/stories/epic-5/story-5.2-export-infrastructure-core.md)
- [Story 5.3: Item/Price Import UI](../_bmad-output/implementation-artifacts/stories/epic-5/story-5.3-item-price-import-ui.md)
- [Story 5.4: Item/Price Export UI](../_bmad-output/implementation-artifacts/stories/epic-5/story-5.4-item-price-export-ui.md)

---

*Retrospective conducted: 2026-03-26*
*Epic 5 stories: 5.1–5.4 all marked done*
*Final test suite: 765/765 passing*
