# Story 43.3: Fix Telemetry package.json Duplicate Exports

**Status:** done
**Priority:** P3

## Story

As a **CI engineer**,
I want **`@jurnapod/telemetry` to have a valid package.json**,
So that **the package linter does not produce a duplicate-key warning**.

## Context

`@jurnapod/telemetry/package.json` has two `exports` keys — one at line 8 and another at line 24. The second overwrites the first in most Node.js versions, but this is undefined behavior per the package.json spec and causes a linter warning during CI runs.

## API Contract Verification

N/A — no API changes.

---

## Acceptance Criteria

**AC1: Single exports block**
**Given** `@jurnapod/telemetry/package.json`
**When** the file is parsed
**Then** it has exactly one `exports` field
**And** the linter produces no duplicate-key warnings

**AC2: All subpath exports preserved**
**Given** the original `exports` had 7 subpaths: `.`, `./slo`, `./metrics`, `./alert-config`, `./correlation`, `./labels`, `./runtime`
**When** the duplicate is merged
**Then** all 7 subpaths are preserved in the single `exports` block

---

## Technical Details

### Current State (broken)

```json
{
  "name": "@jurnapod/telemetry",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": { ... },
  "exports": {     ← DUPLICATE — second block overwrites first
    ".": "./src/index.ts",
    "./slo": "./src/slo.ts",
    ...
  }
}
```

### Fixed State

```json
{
  "name": "@jurnapod/telemetry",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./slo": "./src/slo.ts",
    "./metrics": "./src/metrics.ts",
    "./alert-config": "./src/alert-config.ts",
    "./correlation": "./src/correlation.ts",
    "./labels": "./src/labels.ts",
    "./runtime": "./src/runtime/index.ts"
  },
  "files": ["dist"],
  "scripts": { ... }
}
```

**Note:** The original `exports["."]` used `dist/` outputs (after build). The second `exports["."]` used `src/` (raw TypeScript). The correct target should be `dist/` for the main export since that's the build output. The subpath exports can point to `src/` since they're consumed directly.

---

## Test Coverage Criteria

- [x] Happy paths:
  - [x] `npm run lint -w @jurnapod/telemetry` — 0 errors
    - [x] `npm test -w @jurnapod/telemetry` — passes
    - [x] `npm run typecheck -w @jurnapod/telemetry` — clean

---

## Tasks / Subtasks

- [x] Read `@jurnapod/telemetry/package.json`
- [x] Merge two `exports` blocks into one
- [x] Preserve all 7 subpath exports
- [x] Run `npm run lint -w @jurnapod/telemetry` — confirm 0 errors
- [x] Run `npm test -w @jurnapod/telemetry` — confirm tests pass

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/telemetry/package.json` | Modify | Merge duplicate exports into single block |

---

## Estimated Effort

30 minutes

## Risk Level

Low — pure JSON structure fix, no logic changes.

## Dev Notes

**Why two exports existed:** The first `exports["."]` was the "published" contract using `dist/` (build output). The second was likely added during development to expose subpaths directly from `src/`. Merging is safe as long as both are preserved.

---

## Validation Evidence

```bash
npm run lint -w @jurnapod/telemetry  # should be 0 errors
npm test -w @jurnapod/telemetry       # should pass
npm run typecheck -w @jurnapod/telemetry  # should be clean
```

---

## Dependencies

None

---

## Technical Debt Review

- [x] No shortcuts taken that require follow-up
- [x] No `TODO`/`FIXME` comments left in production code
- [x] No `as any` casts added
- [x] No deprecated functions used
- [x] No N+1 query patterns introduced
- [x] No in-memory state introduced
- [x] Tests included

## Follow-up (P2 — not in scope for this epic)

The merged `exports` block mixes targets:
- `"."` → `dist/` (build output)
- subpaths (`./slo`, `./metrics`, etc.) → `src/` (raw TypeScript)

With `"files": ["dist"]`, subpath imports may not resolve outside the workspace. If `@jurnapod/telemetry` is ever packed/published directly, the subpath exports will break. Recommend normalizing all exports to `dist/` once the package has a formal build step.
