# Story 31.5: Import/Export Infrastructure → `modules-platform`

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-31.5 |
| Title | Import/Export Infrastructure → `modules-platform` |
| Status | pending |
| Type | Extraction |
| Sprint | 2 of 2 |
| Priority | P2 |
| Estimate | 12h |

---

## Story

As a Platform Engineer,
I want the Import/Export infrastructure to live in `@jurnapod/modules-platform`,
So that batch data operations are reusable and the API routes become thin adapters.

---

## Background

`apps/api/src/lib/import/` and `apps/api/src/lib/export/` contain ~6,000 LOC of:
- Import session management
- File parsers (CSV, Excel)
- Validation orchestrators
- Batch operation processors
- Export streaming, formatters, generators

This infrastructure should move to `@jurnapod/modules-platform` alongside Companies and Users.

---

## Acceptance Criteria

1. Import session, parsers, validators moved to `@jurnapod/modules-platform`
2. Export streaming, formatters moved to `@jurnapod/modules-platform`
3. `routes/import.ts` delegates to package — thin adapter
4. `routes/export.ts` delegates to package — thin adapter
5. No `packages/modules/platform` importing from `apps/api/**`
6. `npm run typecheck -w @jurnapod/modules-platform` passes
7. `npm run typecheck -w @jurnapod/api` passes

---

## Technical Notes

### Target Structure

```
packages/modules/platform/src/import-export/
  index.ts
  import/
    session-service.ts   # Import session lifecycle
    parsers/            # CSV, Excel parsers
    validators/         # Row validators
    batch-processor.ts   # Batch operation processor
  export/
    streaming.ts         # Streaming export
    formatters/          # CSV, Excel formatters
    generators/          # Report generators
  types/
  contracts/
```

### Architecture Rules

- No package imports from `apps/api/**`
- File upload/download handling stays in API (HTTP concerns)
- Package handles parsing, validation, processing logic
- NO MOCK DB for DB-backed business logic tests

---

## Tasks

- [ ] Read `lib/import/` and `lib/export/` fully
- [ ] Create `packages/modules/platform/src/import-export/` structure
- [ ] Move import session + parsers + validators
- [ ] Move export streaming + formatters
- [ ] Update `routes/import.ts` to delegate
- [ ] Update `routes/export.ts` to delegate
- [ ] Run typecheck + build
- [ ] Integration tests with real DB

---

## Validation

```bash
npm run typecheck -w @jurnapod/modules-platform
npm run typecheck -w @jurnapod/api
```
