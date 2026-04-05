# Story 36.2: Extract Import Core Infrastructure

## Story Summary

| Field | Value |
|-------|-------|
| Story | story-36.2 |
| Title | Extract Import Core Infrastructure |
| Status | pending |
| Type | Extraction |
| Sprint | TBD |
| Priority | P1 |
| Estimate | 8-10h |

## Story

As a platform engineer, I want to move the import core logic from `apps/api/src/lib/import/` into `@jurnapod/modules-platform`, so that the import infrastructure becomes reusable across applications and properly bounded by package contracts.

## Background

Building on the DB decoupling from Story 36.1, this story moves the core import modules (parsers, validators, session store, types) into `@jurnapod/modules-platform/import-export/import/`. The API lib will maintain re-exports for backward compatibility during the transition period.

## Acceptance Criteria

1. Created `packages/modules/platform/src/import-export/import/` directory structure
2. Moved `session-store.ts` → package (session lifecycle management)
3. Moved `parsers.ts` → package (CSV, Excel parsing from Buffer)
4. Moved `validator.ts` → package (row validators)
5. Moved `validation.ts` → package (validation orchestrators)
6. Moved `types.ts` → package
7. Package does NOT import from `apps/api/**`
8. API lib re-exports from package for backward compatibility (wrapper layer)
9. `npm run typecheck -w @jurnapod/modules-platform` passes
10. All functions accept `db: KyselySchema` as injected dependency

## Technical Notes

- Target structure:
  ```
  packages/modules/platform/src/import-export/
    import/
      index.ts           # public exports
      session-store.ts   # moved from lib/import/
      parsers.ts         # moved from lib/import/
      validator.ts        # moved from lib/import/
      validation.ts       # moved from lib/import/
      types.ts           # moved from lib/import/
  ```
- Use `@jurnapod/db` for `KyselySchema` type dependency
- Do not include route-level orchestration (that's Story 36.4)
- Parser functions should accept `Buffer` and return parsed row arrays
- Session store should handle create/update/get/checkpoint operations
- Maintain exact same function signatures as original (db as first param)

## Tasks

- [ ] Create `packages/modules/platform/src/import-export/import/` directory
- [ ] Copy `session-store.ts` to package and update imports to use `KyselySchema` type
- [ ] Copy `parsers.ts` to package and update imports
- [ ] Copy `validator.ts` to package and update imports
- [ ] Copy `validation.ts` to package and update imports
- [ ] Copy `types.ts` to package and update imports
- [ ] Create `index.ts` with public exports
- [ ] Create backward-compat wrapper in `apps/api/src/lib/import/` that re-exports from package
- [ ] Verify `npm run typecheck -w @jurnapod/modules-platform` passes
- [ ] Verify `npm run typecheck -w @jurnapod/api` still passes

## Validation

```bash
npm run typecheck -w @jurnapod/modules-platform
npm run typecheck -w @jurnapod/api
```

Package must typecheck independently; API must still typecheck with backward-compat wrappers.
