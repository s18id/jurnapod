# Story 45.4: Automated Import Path Update Script

**Epic:** Epic 45 — Tooling Standards & Process Documentation
**Story ID:** 45-4-import-path-script
**Output file:** `_bmad-output/implementation-artifacts/stories/epic-45/story-45.4.md`
**Completion note:** `_bmad-output/implementation-artifacts/stories/epic-45/story-45.4.completion.md`

---

## Story

### As a:
Developer

### I want:
An automated script that remaps `../../../../lib/` relative paths to `@/` aliases during refactoring

### So that:
Large-scale import path migrations are fast, consistent, and error-free.

---

## Acceptance Criteria

**Given** a developer is performing a large-scale refactor that moves code between directories,
**When** they run the import path update script,
**Then** the script must:
- Accept source and target directory paths as arguments
- Scan all `.ts` and `.tsx` files in the target directory
- Replace relative import paths that resolve to the source directory with `@/` aliases
- Preserve imports from external packages (`@jurnapod/*`, `node_modules`)
- Output a diff showing all changes before applying
- Be idempotent (safe to re-run with no changes on already-converted files)
**And** include usage instructions in `docs/process/tool-standardization-checklist.md`

---

## Tasks/Subtasks

- [x] 1. Create the `scripts/update-import-paths.ts` script
  - [x] 1.1 Accept `--source` and `--target` CLI arguments
  - [x] 1.2 Implement path resolution to detect relative imports pointing to source directory
  - [x] 1.3 Scan `.ts` and `.tsx` files in target directory recursively
  - [x] 1.4 Replace relative imports with `@/` aliases where appropriate
  - [x] 1.5 Preserve external package imports (`@jurnapod/*`, `node_modules`)
  - [x] 1.6 Output diff of proposed changes before applying
  - [x] 1.7 Apply changes only after diff review (with confirmation prompt)
  - [x] 1.8 Make idempotent (detect already-converted files)

- [x] 2. Update `docs/process/tool-standardization-checklist.md` with usage instructions

- [x] 3. Create completion note file

- [x] 4. Ensure script is runnable with `tsx scripts/update-import-paths.ts --source X --target Y`

---

## Dev Notes

### Implementation Notes

1. **Path Resolution Algorithm:**
   - Normalize both source and target paths to absolute paths
   - For each relative import in target files, resolve it relative to the file's location
   - Check if the resolved path matches or is under the source directory
   - If matched, convert to `@/` alias based on the relative position from `apps/api/src/`

2. **Alias Mapping:**
   - When converting, determine the shortest `@/` alias that would resolve to the same location
   - Example: `../../../../lib/db` from `apps/api/src/routes/pos.ts` → `@/lib/db`
   - Use TypeScript path mapping convention: `@/` maps to `apps/api/src/`

3. **Idempotency:**
   - Before modifying a file, check if imports are already using `@/` aliases
   - Skip files that are already properly converted
   - Log skipped files for transparency

4. **Diff Output:**
   - Use a unified diff format showing before/after for each file
   - Group changes by file
   - Show summary: X files changed, Y imports updated

5. **Confirmation:**
   - Prompt user to confirm before applying changes
   - Support `--dry-run` flag to show diff without applying
   - Support `--force` flag to skip confirmation (for CI automation)

---

## Dev Agent Record

### Implementation Plan

1. Create `scripts/update-import-paths.ts` with:
   - CLI argument parsing using a lightweight library (minimist or custom)
   - Recursive file scanning with glob pattern
   - Import path regex parsing
   - Path resolution utilities
   - Diff generation and display
   - File modification with backup

2. Update checklist documentation with:
   - Script description and purpose
   - Usage examples
   - Common use cases
   - Best practices

### Technical Decisions

- Use `tsx` directly without compilation step (TypeScript execution)
- Use `picocolors` or ANSI codes for colored diff output
- Store backups of modified files with `.bak` extension
- Parse imports using regex that handles both `import x from 'path'` and `import 'path'` patterns

---

## File List

- `scripts/update-import-paths.ts` — Main script file (created)
- `docs/process/tool-standardization-checklist.md` — Updated with usage instructions (modified)
- `_bmad-output/implementation-artifacts/stories/epic-45/story-45.4.completion.md` — Completion note (created)

---

## Change Log

- **2026-04-19**: Created `scripts/update-import-paths.ts` with full CLI argument handling, path resolution, import conversion, diff output, and idempotency support
- **2026-04-19**: Updated `docs/process/tool-standardization-checklist.md` with Section 7 "Import Path Update Script" containing usage instructions
- **2026-04-19**: Created completion note at `_bmad-output/implementation-artifacts/stories/epic-45/story-45.4.completion.md`

---

## Status

`review`