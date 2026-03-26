# Story 7.7: Export & Settings Route Test Coverage

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want comprehensive test coverage for export and settings routes,
so that I can confidently make changes to critical export flows and settings management without introducing regressions.

## Context

`apps/api/src/routes/export.ts` is 513 lines handling critical export flows (CSV, Excel, large dataset streaming) with **zero test coverage**. Story 6.7 added 19 integration tests for the import side — the export side was left unmatched. Four settings route files (640+ combined lines) also have no test pairs.

This is the highest-priority quality gap remaining after Epic 7's debt work and aligns with the epic's operational hardening theme.

**Note:** Variant-Level Sync for POS (Q3 2026 roadmap item) is deferred to Epic 8. All prerequisites (item-prices domain isolation from Epic 3) are in place.

## Acceptance Criteria

### AC1: Export Route Integration Tests
- Add `apps/api/src/routes/export.test.ts`
- Cover: export with filters, format selection (CSV vs Excel), column selection
- Cover: large dataset warning (>50K rows → CSV recommendation)
- Cover: company-scoped isolation (company A cannot export company B data)
- Cover: error states (invalid entity type, missing params)
- Mirror the integration test pattern established in Story 6.7 import tests

### AC2: Settings Route Unit Tests
- Add tests for `settings-config.ts`, `settings-pages.ts`, `settings-modules.ts`, `settings-module-roles.ts`
- Cover: CRUD happy paths, validation errors, authorization checks

### AC3: No Regressions
- All existing tests pass; test count ≥ 950 confirmed

## Tasks / Subtasks

- [x] Create export route integration tests (AC1)
  - [x] Create apps/api/src/routes/export.test.ts (unit tests)
  - [x] Create apps/api/tests/integration/export.integration.test.mjs (HTTP tests)
  - [x] Test export with filters
  - [x] Test format selection (CSV vs Excel)
  - [x] Test column selection
  - [~] Test large dataset warning (>50K rows) → Moved to Story 7.8
  - [x] Test company-scoped isolation
  - [x] Test error states (invalid entity, missing params)
- [x] Create settings route tests (AC2)
  - [x] Create tests for settings-config.ts (schema validation)
  - [x] Create tests for settings-pages.ts (schema validation)
  - [x] Create tests for settings-modules.ts (schema validation)
  - [x] Create tests for settings-module-roles.ts (schema validation)
  - [x] Create integration tests for settings routes (HTTP level)
  - [x] Cover CRUD happy paths
  - [x] Cover validation errors
  - [x] Cover authorization checks
- [x] Verify no regressions (AC3)
  - [x] Run full test suite
  - [x] Confirm test count ≥ 950 (actual: 1,408)

## Dev Notes

### Technical Requirements
- Follow Story 6.7 import integration test patterns
- Test both CSV and Excel export formats
- Verify tenant isolation strictly
- Proper database pool cleanup after tests

### Files to Create
- `apps/api/src/routes/export.test.ts` - Export route integration tests
- `apps/api/src/routes/settings-config.test.ts` - Settings config tests
- `apps/api/src/routes/settings-pages.test.ts` - Settings pages tests
- `apps/api/src/routes/settings-modules.test.ts` - Settings modules tests
- `apps/api/src/routes/settings-module-roles.test.ts` - Settings module roles tests

### Files to Reference
- `apps/api/src/routes/import.test.ts` (Story 6.7) - Integration test pattern reference
- `apps/api/src/routes/export.ts` - Export routes to test
- Settings route files to test:
  - `apps/api/src/routes/settings-config.ts`
  - `apps/api/src/routes/settings-pages.ts`
  - `apps/api/src/routes/settings-modules.ts`
  - `apps/api/src/routes/settings-module-roles.ts`

### Export Route Test Coverage Areas

**Happy Path Tests:**
- Export items with default columns
- Export with custom column selection
- Export with filters (date range, status, etc.)
- CSV format export
- Excel format export

**Edge Cases:**
- Empty result set (no data to export)
- Large dataset (>50K rows) → should recommend CSV
- Maximum file size handling

**Security/Isolation:**
- Company A cannot export Company B data
- Unauthorized access attempts

**Error Cases:**
- Invalid entity type
- Missing required parameters
- Malformed filter parameters

### Settings Route Test Coverage Areas

**Per Route File:**
- List endpoint (if applicable)
- Get by ID endpoint
- Create endpoint
- Update endpoint
- Delete endpoint (if applicable)

**Cross-Cutting:**
- Validation error handling
- Authorization checks
- Company-scoped data access

### Testing Notes
- Use test data factories for consistent test data
- Mock external services if needed
- Test both success and failure paths
- Document any testing gaps discovered

### Database Pool Cleanup
```typescript
test.after(async () => {
  await closeDbPool();
});
```

### References

- [Source: _bmad-output/planning-artifacts/epic-7.md] - Epic 7 full specification
- [Source: apps/api/src/routes/export.ts] - Export routes to test
- [Source: apps/api/src/routes/import.test.ts] - Integration test pattern reference (Story 6.7)

## Dev Agent Record

### Agent Model Used
minimax-m2.5

### Debug Log References
N/A

### Completion Notes List
- Export route: 66 unit tests + 7 HTTP integration tests
- Settings routes: 227 unit tests (schema validation)
- Settings integration: 10+ HTTP tests
- Company isolation tested for export
- Auth enforcement tested for settings
- All 1,408 tests passing

### File List
- apps/api/src/routes/export.test.ts
- apps/api/src/routes/settings-config.test.ts
- apps/api/src/routes/settings-pages.test.ts
- apps/api/src/routes/settings-modules.test.ts
- apps/api/src/routes/settings-module-roles.test.ts
- apps/api/tests/integration/export.integration.test.mjs
- apps/api/tests/integration/settings-config.integration.test.mjs
- apps/api/tests/integration/settings-pages.integration.test.mjs (new)
- apps/api/tests/integration/settings-modules.integration.test.mjs (new)
- apps/api/tests/integration/settings-module-roles.integration.test.mjs (new)
