# Epic 5: Import/Export Infrastructure

**Status:** Done  
**Completed:** 2026-03-26  
**Story Count:** 4 (5.1 through 5.4)  

---

## Goal

Build foundational import/export frameworks enabling bulk data operations for items, prices, and eventually other master data entities.

---

## Business Value

- Enable bulk upload of product catalogs (hundreds or thousands of items)
- Support price updates across multiple outlets
- Reduce manual entry errors and save time for backoffice users
- Provide data portability for analysis, reporting, and bulk editing

---

## Stories

| Story | Description | Status |
|-------|-------------|--------|
| [5.1](story-5.1-import-infrastructure-core.md) | Import Infrastructure Core — CSV/Excel parsing, validation framework, batch processing | Done |
| [5.2](story-5.2-export-infrastructure-core.md) | Export Infrastructure Core — CSV/Excel generation, streaming exports, column mapping | Done |
| [5.3](story-5.3-item-price-import-ui.md) | Item/Price Import UI — Import wizard with column mapping and validation preview | Done |
| [5.4](story-5.4-item-price-export-ui.md) | Item/Price Export UI — Export dialog with format/column selection | Done |

---

## Key Deliverables

### Framework Infrastructure
- **`lib/import/`** — Reusable import framework with:
  - CSV/Excel parsing with streaming support
  - Validation framework with row-level error reporting
  - Batch processing with transactional safety
  - Type definitions and interfaces for extensibility

- **`lib/export/`** — Reusable export framework with:
  - CSV/Excel generation utilities
  - Column mapping and formatting framework
  - Streaming export for large datasets
  - Chunked Excel generation (10K rows/sheet)

### UI Components
- Import wizard with 5-step flow (upload → mapping → validation → apply → results)
- Export dialog with format selection and column customization
- Column auto-detection and mapping UI
- Progress tracking and validation preview components

### API Endpoints
- `POST /api/import/:entityType/upload` — Upload and parse files
- `POST /api/import/:entityType/validate` — Dry-run validation
- `POST /api/import/:entityType/apply` — Execute import
- `GET /api/import/:entityType/template` — Download template
- `POST /api/export/:entityType` — Generate export
- `GET /api/export/:entityType/columns` — List available columns

---

## Success Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Stories complete | 4 | 4 ✅ |
| API unit tests | 765 passing | 765 ✅ |
| File size limit | 50MB | 50MB ✅ |
| Excel row limit | 50K rows | 50K ✅ |
| Memory usage (50MB file) | <250MB | 150-250MB ✅ |

---

## Technical Debt Created

Documented in [ADR-0010: Import/Export Framework Technical Debt](../../docs/adr/ADR-0010-import-export-technical-debt.md)

| TD | Description | Priority | Resolution |
|----|-------------|----------|------------|
| TD-1 | CSV parsing loads entire file into memory | Medium | Resolved in Epic 7 |
| TD-2 | Excel parsing loads entire workbook into memory | Medium | Resolved in Epic 7 |
| TD-3 | Excel export memory issues for large datasets | High | Resolved in 5.4 |
| TD-4 | Batch processor hardcoded companyId=0 | High | Resolved in 5.1 |
| TD-5 | FK validation may cause N+1 queries | Medium | Resolved in Epic 7 |
| TD-6 | No resume/checkpoint for interrupted imports | Low | Resolved in Epic 7 |

---

## Dependencies Added

- `papaparse` — CSV parsing (streaming, battle-tested)
- `xlsx` — Excel parsing and generation
- `@types/papaparse` — TypeScript types

---

## Files Created

### API Import Framework
- `apps/api/src/lib/import/types.ts` — Shared import types and interfaces
- `apps/api/src/lib/import/parsers.ts` — CSV/Excel parsing utilities
- `apps/api/src/lib/import/validator.ts` — Validation framework
- `apps/api/src/lib/import/batch-processor.ts` — Batch processing with transactions
- `apps/api/src/lib/import/index.ts` — Public API exports
- `apps/api/src/lib/import/import.test.ts` — Unit tests (56 tests)

### API Export Framework
- `apps/api/src/lib/export/types.ts` — Shared export types
- `apps/api/src/lib/export/formatter.ts` — Data formatting utilities
- `apps/api/src/lib/export/generators.ts` — CSV/Excel generation
- `apps/api/src/lib/export/streaming.ts` — Streaming export
- `apps/api/src/lib/export/index.ts` — Public API exports
- `apps/api/src/lib/export/export.test.ts` — Unit tests (80 tests)

### API Routes
- `apps/api/src/routes/import.ts` — Import API endpoints (added in Epic 6)
- `apps/api/src/routes/export.ts` — Export API endpoints (added in Epic 6)

### Backoffice UI
- `apps/backoffice/src/components/import-wizard.tsx` — Extended with step navigation
- `apps/backoffice/src/components/import-column-mapper.tsx` — Column mapping UI
- `apps/backoffice/src/components/import-validation-preview.tsx` — Validation preview
- `apps/backoffice/src/components/import-progress.tsx` — Progress display
- `apps/backoffice/src/components/export-dialog.tsx` — Export configuration dialog
- `apps/backoffice/src/components/column-selector.tsx` — Column selection
- `apps/backoffice/src/components/format-selector.tsx` — Format selection
- `apps/backoffice/src/hooks/use-import.ts` — Import API hooks
- `apps/backoffice/src/hooks/use-export.ts` — Export API hooks
- `apps/backoffice/src/features/item-import-page.tsx` — Item import page
- `apps/backoffice/src/features/price-import-page.tsx` — Price import page

---

## Retrospective Summary

**What Went Well:**
- Framework extensibility — clear interfaces allow new entity types without core changes
- Technical debt awareness — ADR-0010 created early, documenting all known issues
- Batch processing safety — transactional processing prevents data corruption
- Streaming export for large datasets — chunked Excel generation with limits
- Tenant isolation enforcement — company_id now required in BatchOptions

**Challenges:**
- Export API endpoint gap — endpoint not created until code review identified it
- Integration test gaps — deferred from original stories, added in Epic 6
- Story status tracking discrepancies required manual reconciliation

**Key Lessons:**
- Infrastructure stories must include actual API endpoints
- State management patterns need explicit documentation
- Integration tests should be part of framework epics, not deferred

---

## Related Documentation

- [Epic 5 Retrospective](../epic-5-retro-2026-03-26.md)
- [ADR-0010: Import/Export Framework Technical Debt](../../docs/adr/ADR-0010-import-export-technical-debt.md)
- [Story 5.1: Import Infrastructure Core](story-5.1-import-infrastructure-core.md)
- [Story 5.2: Export Infrastructure Core](story-5.2-export-infrastructure-core.md)
- [Story 5.3: Item/Price Import UI](story-5.3-item-price-import-ui.md)
- [Story 5.4: Item/Price Export UI](story-5.4-item-price-export-ui.md)

---

*Epic 5 completed: 2026-03-26*  
*All stories marked done, 765/765 tests passing*
