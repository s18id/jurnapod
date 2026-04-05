# Story 36.1: DB Decoupling & Dependency Inversion Foundations

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-36.1 |
| Title | DB Decoupling & Dependency Inversion Foundations |
| Status | pending |
| Type | Extraction/Refactor |
| Sprint | TBD |
| Priority | P1 |
| Estimate | 6-8h |

## Story

As a platform engineer, I want to replace all internal `getDb()`/`getDbPool()` calls in `lib/import/` and `lib/export/` with injected DB dependencies, so that the import/export infrastructure can be safely extracted into `@jurnapod/modules-platform` without API alias coupling.

## Background

This story addresses the architectural debt identified in Epic 36 where `import/batch-operations.ts` imports `@/lib/db` (an API alias), creating a hard coupling between the import/export libs and the API layer. This prevents extraction because the package cannot import from `apps/api/**`. All internal DB access must be converted to explicit dependency injection before any code can be moved.

## Acceptance Criteria

1. All files in `apps/api/src/lib/import/` and `apps/api/src/lib/export/` use `db: KyselySchema` parameter instead of calling `getDb()` or `getDbPool()` directly
2. `batch-operations.ts` no longer imports from `@/lib/db` API alias
3. No raw `getDb()` calls remain within `lib/import/` and `lib/export/` directories
4. Functions that previously called `getDb()` internally now accept `db: KyselySchema` as a parameter
5. `npm run typecheck -w @jurnapod/api` passes after changes
6. Import/export functionality is not broken by the refactoring

## Technical Notes

- Use `KyselySchema` type from `@jurnapod/db` for DB dependency typing
- Service functions should follow pattern: `async function someOperation(input, { db }: { db: KyselySchema })`
- Optional dependencies (clock, logger) should use optional typing: `{ db: KyselySchema, clock?: ClockPort, logger?: LoggerPort }`
- Do NOT yet move any files—this story is only about dependency inversion within existing locations
- Keep all function signatures backward-compatible during transition (optional db param with fallback)

## Tasks

- [ ] Audit all files in `lib/import/` for `getDb`, `getDbPool`, `@/lib/db` usage
- [ ] Audit all files in `lib/export/` for `getDb`, `getDbPool`, `@/lib/db` usage
- [ ] Identify all functions that need `db: KyselySchema` parameter added
- [ ] Update `batch-operations.ts` to accept db as parameter instead of importing `@/lib/db`
- [ ] Update all internal call sites within import/export libs to pass db through
- [ ] Verify no raw `getDb()` calls remain in import/export libs
- [ ] Run typecheck to ensure no regressions

## Validation

```bash
npm run typecheck -w @jurnapod/api
```

All files in `apps/api/src/lib/import/` and `apps/api/src/lib/export/` must typecheck without accessing `@/lib/db` or calling `getDb()` directly.
