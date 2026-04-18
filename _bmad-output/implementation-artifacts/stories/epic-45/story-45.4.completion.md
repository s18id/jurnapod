# Story 45.4: Automated Import Path Update Script — Completion Note

**Epic:** Epic 45 — Tooling Standards & Process Documentation
**Story ID:** 45-4-import-path-script
**Completed:** Sun Apr 19 2026

---

## Summary

Created an automated import path update script that remaps relative import paths to `@/` aliases during refactoring. The script is idempotent and provides diff output before applying changes.

---

## What Was Implemented

### 1. Created `scripts/update-import-paths.ts`

A Node.js/TypeScript script that:
- Accepts `--source` and `--target` CLI arguments for source and target directories
- Recursively scans `.ts` and `.tsx` files in the target directory
- Uses proper path resolution to detect relative imports pointing to the source directory
- Converts relative imports to `@/` aliases (e.g., `../../lib/db` → `@/lib/db`)
- Preserves external package imports (`@jurnapod/*`, `node_modules`)
- Outputs unified diff showing all changes before applying
- Supports `--dry-run` mode for preview without applying
- Supports `--force` mode for CI automation (skips confirmation)
- Is idempotent — safe to re-run on already-converted files
- Creates `.bak` backup files before modifying

### 2. Updated `docs/process/tool-standardization-checklist.md`

Added Section 7 "Import Path Update Script" with:
- Script location and purpose
- Usage examples and options table
- Common workflow guide
- Idempotency explanation

### 3. Verification

- Script runs successfully with `npx tsx scripts/update-import-paths.ts --help`
- Dry-run mode works correctly, showing diffs without applying
- Script correctly identifies files needing conversion (tested on `apps/api/src` — found 123 files with 389 imports to update)
- Script correctly handles already-converted files (they have no relative imports to source)

---

## Files Created/Modified

| File | Action | Description |
|------|--------|-------------|
| `scripts/update-import-paths.ts` | Created | Main script file |
| `docs/process/tool-standardization-checklist.md` | Modified | Added Section 7 with usage instructions |
| `_bmad-output/implementation-artifacts/stories/epic-45/story-45.4.md` | Modified | Updated task status to complete |
| `_bmad-output/implementation-artifacts/stories/epic-45/story-45.4.completion.md` | Created | This completion note |

---

## Usage

```bash
# Preview changes without applying
npx tsx scripts/update-import-paths.ts --source apps/api/src --target apps/api/src/routes --dry-run

# Apply changes with confirmation
npx tsx scripts/update-import-paths.ts --source apps/api/src --target apps/api/src/routes

# Force apply without confirmation (CI mode)
npx tsx scripts/update-import-paths.ts --source apps/api/src --target apps/api/src/routes --force
```

---

## Acceptance Criteria Verification

| Criteria | Status |
|----------|--------|
| Accept source and target directory paths as arguments | ✅ `--source` and `--target` flags |
| Scan all `.ts` and `.tsx` files in the target directory | ✅ Recursive directory scanning |
| Replace relative import paths that resolve to the source directory with `@/` aliases | ✅ Implemented |
| Preserve imports from external packages (`@jurnapod/*`, `node_modules`) | ✅ External detection logic |
| Output a diff showing all changes before applying | ✅ Unified diff format with colors |
| Be idempotent (safe to re-run with no changes on already-converted files) | ✅ No changes reported on re-run |
| Include usage instructions in `docs/process/tool-standardization-checklist.md` | ✅ Section 7 added |

---

## Notes

- The script uses `tsx` for TypeScript execution (standard project approach)
- Uses `node:readline` for confirmation prompt (built-in Node.js)
- Backup files are created with `.bak` extension before modifying
- Color output via ANSI escape codes for diff readability