# story-25.1: Scaffold modules-treasury package

## Description

Create the `@jurnapod/modules-treasury` package structure following the established patterns from `modules-accounting` and `modules-sales`. This is the foundation for extracting cash-bank domain logic from the API.

## Acceptance Criteria

- [x] Package directory structure created at `packages/modules/treasury/`
- [x] `package.json` created with proper dependencies:
  - `@jurnapod/db` (for Kysely types if needed)
  - `@jurnapod/shared` (for shared types/schemas)
  - `@jurnapod/modules-accounting` (for PostingService)
  - `@jurnapod/modules-platform` (for AccessScopeChecker port)
- [x] `tsconfig.json` configured following module package conventions
- [x] Source directory structure: `src/` with `index.ts` as entry point
- [x] Build scripts configured (`build`, `typecheck`)
- [x] Package exports configured in `package.json` exports field
- [x] `README.md` with package description and public API overview
- [x] Package successfully builds (`npm run build -w @jurnapod/modules-treasury`)
- [x] Package typecheck passes (`npm run typecheck -w @jurnapod/modules-treasury`)
- [x] No lint errors

## Files to Create

```
packages/modules/treasury/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    └── index.ts (initially empty or with placeholder export)
```

### package.json template

```json
{
  "name": "@jurnapod/modules-treasury",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@jurnapod/db": "0.1.0",
    "@jurnapod/shared": "0.1.0",
    "@jurnapod/modules-accounting": "0.1.0",
    "@jurnapod/modules-platform": "0.1.0"
  },
  "devDependencies": {
    "typescript": "^5.7.3"
  }
}
```

### tsconfig.json template

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

## Dependencies

- None (first story in epic)

## Estimated Effort

1.5 hours

## Priority

P1

## Validation Commands

```bash
cd /home/ahmad/jurnapod

# Build package
npm run build -w @jurnapod/modules-treasury

# Type check
npm run typecheck -w @jurnapod/modules-treasury

# Verify workspace typecheck still passes
npm run typecheck -w @jurnapod/api
```

## Notes

- Follow the exact structure of `packages/modules/accounting/`
- Ensure proper dependency versions match existing modules
- The package should be importable from API but should NOT import from apps/api
- This is foundational work - getting the structure right prevents issues in subsequent stories

## Status

DONE
