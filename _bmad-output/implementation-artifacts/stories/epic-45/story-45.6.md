# Story 45.6: Vitest Alias Config Template for All Packages

**Epic:** Epic 45 — Tooling Standards & Process Documentation
**Story ID:** 45-6-vitest-alias-template
**Output file:** `_bmad-output/implementation-artifacts/stories/epic-45/story-45.6.md`
**Completion note:** `_bmad-output/implementation-artifacts/stories/epic-45/story-45.6.completion.md`
**Status:** done

---

## Story

### As a:
Developer

### I want:
A vitest alias configuration template that adds `@/` path alias support to all packages

### So that:
Tests in any package can use the same import conventions as production code.

---

## Context

Epic 45 focuses on tooling standards and process documentation. Story 45.5 established fixture standards. Story 45.6 establishes the vitest alias configuration standard so packages can use `@/` and `@jurnapod/*` path aliases in tests, matching production code import conventions.

---

## Acceptance Criteria

**AC1: Template exists at correct location**
**Given** a developer needs vitest alias configuration for a package,
**When** they look for `docs/templates/vitest-config-package.md`,
**Then** the file exists and is copy-paste ready.

**AC2: `@/` alias mapping shown**
**Given** a developer copies the template,
**When** they apply it to their `vitest.config.ts`,
**Then** they can configure `@/` to map to `<packageRoot>/src`.

**AC3: `@jurnapod/*` alias mappings shown**
**Given** a developer copies the template,
**When** they apply it to their `vitest.config.ts`,
**Then** they can configure all `@jurnapod/*` package aliases to map to the correct `packages/*/src` paths.

**AC4: Standard timeout configuration included**
**Given** a developer copies the template,
**When** they apply it to their `vitest.config.ts`,
**Then** it includes `testTimeout: 30000`, `hookTimeout: 30000`, and `teardownTimeout: 10000`.

**AC5: Package root path adaptation documented**
**Given** a developer is using a package at a non-standard depth,
**When** they read the template comments,
**Then** they find guidance on adapting the `../../packages/` path depth for their package structure.

---

## Tasks / Subtasks

- [x] 1. Check if `docs/templates/vitest-config-package.md` already exists
- [x] 2. Update the template to include `@/` and `@jurnapod/*` alias mappings
- [x] 3. Add standard timeout configuration
- [x] 4. Add comments explaining package root path adaptation
- [x] 5. Create story spec file
- [x] 6. Create completion note file
- [x] 7. Update sprint-status.yaml to set story to done

---

## Files to Create

| File | Description |
|------|-------------|
| `_bmad-output/implementation-artifacts/stories/epic-45/story-45.6.completion.md` | Story completion note |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/templates/vitest-config-package.md` | Modify | Added `@/` and `@jurnapod/*` alias mappings with standard timeouts |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Modify | Set 45-6-vitest-alias-template to done |

---

## Estimated Effort

0.25 days

## Risk Level

None — documentation/template only

---

## Dev Notes

The template at `docs/templates/vitest-config-package.md` previously stated "NO alias section — packages use relative imports". The story acceptance criteria required showing `@/` and `@jurnapod/*` aliases, so the template was updated to reflect this standard.

The template now includes:
1. Full `resolve.alias` configuration with `@/` mapping to `packageRoot/src`
2. All `@jurnapod/*` package aliases mapped to their respective `packages/*/src` paths
3. Standard test timeouts (30s/30s/10s)
4. Comments explaining how to adapt path depths for different package locations

---

## File List

- `docs/templates/vitest-config-package.md` — Updated with alias configuration (modified)
- `_bmad-output/implementation-artifacts/stories/epic-45/story-45.6.md` — This story spec (created)
- `_bmad-output/implementation-artifacts/stories/epic-45/story-45.6.completion.md` — Completion note (created)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Updated story status (modified)
