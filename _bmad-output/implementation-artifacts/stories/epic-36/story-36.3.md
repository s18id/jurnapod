# Story 36.3: Extract Export Core + Query Safety Hardening

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-36.3 |
| Title | Extract Export Core + Query Safety Hardening |
| Status | pending |
| Type | Extraction |
| Sprint | TBD |
| Priority | P1 |
| Estimate | 8-10h |

## Story

As a platform engineer, I want to move the export core logic to `@jurnapod/modules-platform` and fix SQL query safety issues, so that export functionality is properly encapsulated and no longer relies on brittle custom SQL placeholder interpolation.

## Background

The export infrastructure in `lib/export/` has a critical issue: `query-builder.ts` uses manual SQL placeholder interpolation which is unsafe and can lead to SQL injection vulnerabilities. Additionally, all export modules need to be moved to the platform package to enable thin-adapter routes. This story addresses both the extraction and the security hardening.

## Acceptance Criteria

1. Created `packages/modules/platform/src/import-export/export/` directory structure
2. Moved `streaming.ts` → package (stream chunk generation from Buffer)
3. Moved `formatters.ts` → package (CSV, Excel formatters)
4. Moved `generators.ts` → package (report generators)
5. Moved `query-builder.ts` → package with query safety fixes
6. Replaced brittle custom SQL placeholder interpolation with parameterized Kysely queries
7. Moved `types.ts` → package
8. Package does NOT import from `apps/api/**`
9. API lib re-exports from package for backward compatibility
10. `npm run typecheck -w @jurnapod/modules-platform` passes

## Technical Notes

- Target structure:
  ```
  packages/modules/platform/src/import-export/
    export/
      index.ts           # public exports
      streaming.ts       # moved from lib/export/
      formatters.ts      # moved from lib/export/
      generators.ts      # moved from lib/export/
      query-builder.ts   # moved from lib/export/ (REWRITTEN)
      types.ts           # moved from lib/export/
  ```
- **CRITICAL**: Replace manual SQL string interpolation in query-builder with Kysely's parameterized query builder
- Use `.where()` and `.bind()` methods instead of string concatenation
- Ensure all filter/date/sort parameters are passed via safe bindings
- Export functions should accept `db: KyselySchema` as injected dependency
- Streaming should maintain chunked output for large datasets

## Tasks

- [ ] Create `packages/modules/platform/src/import-export/export/` directory
- [ ] Copy `streaming.ts` to package and update imports
- [ ] Copy `formatters.ts` to package and update imports
- [ ] Copy `generators.ts` to package and update imports
- [ ] Rewrite `query-builder.ts` with parameterized Kysely queries (no string interpolation)
- [ ] Copy `types.ts` to package and update imports
- [ ] Create `index.ts` with public exports
- [ ] Create backward-compat wrapper in `apps/api/src/lib/export/` that re-exports from package
- [ ] Verify `npm run typecheck -w @jurnapod/modules-platform` passes
- [ ] Run security review on rewritten query-builder to ensure no injection vectors

## Validation

```bash
npm run typecheck -w @jurnapod/modules-platform
npm run typecheck -w @jurnapod/api
```

Query-builder must use only parameterized queries with `.bind()` or `.where()` for user inputs.
