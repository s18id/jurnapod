# Story 37.4: Delete image-storage.ts (Cleanup)

Status: done

## Story

As a **developer**,
I want `lib/image-storage.ts` deleted after confirming no other callers depend on it,
So that there is a single source of truth for file storage (`lib/uploader/file-storage.ts`).

## Context

After Story 37.3, `lib/image-storage.ts` becomes a dead file — all its code has been moved to `lib/uploader/file-storage.ts` and `item-images.ts` no longer imports from it.

This story:
1. Audits all imports of `image-storage.ts` across the codebase
2. Deletes it if no callers remain
3. Updates any stale references

## Acceptance Criteria

**AC1: No imports of image-storage.ts remain**
**Given** the entire codebase
**When** I search for `from.*image-storage` and `import.*image-storage`
**Then** no import statements are found

**AC2: image-storage.ts is deleted**
**Given** the audit confirms no callers
**When** the story is complete
**Then** `apps/api/src/lib/image-storage.ts` no longer exists

**AC3: All functionality still works**
**Given** `image-storage.ts` is deleted
**When** I run the full test suite
**Then** all tests pass
**And** `npm run typecheck -w @jurnapod/api` passes
**And** `npm run build -w @jurnapod/api` succeeds

## Tasks / Subtasks

- [x] Search entire codebase for `image-storage` imports
  - [x] Check `apps/api/src/`
  - [x] Check `packages/`
  - [x] Check `apps/pos/src/`
  - [x] Check `apps/backoffice/src/`
- [x] No imports found — delete
- [x] Delete `apps/api/src/lib/image-storage.ts`
- [x] Run full test suite — 171 tests pass
- [x] Run typecheck — passes
- [x] Run build — passes

## Files to Delete

| File | Reason |
|------|--------|
| `apps/api/src/lib/image-storage.ts` | Code moved to `lib/uploader/file-storage.ts` |

## Estimated Effort

1h

## Risk Level

Low — Deletion only happens after confirming no callers exist.

## Dev Notes

### Audit Commands

```bash
# Search for imports
grep -r "image-storage" apps/api/src/ --include="*.ts" | grep -v "node_modules"
grep -r "image-storage" packages/ --include="*.ts" | grep -v "node_modules"
```

### If Import Found

If any file still imports from `image-storage.ts`, update the import path:

```typescript
// BEFORE
import { createStorageProvider, LocalStorageProvider } from './image-storage.js';

// AFTER
import { createStorageProvider, LocalStorageProvider } from './uploader/file-storage.js';
```

## Dependencies

- Story 37.3 (refactor complete — no remaining callers expected)

## Dev Agent Record

### Audit Results

Searched entire codebase for `image-storage` imports — **zero callers found**:
- `apps/api/src/` — no imports of `image-storage`
- `packages/` — no imports
- `apps/pos/src/` — no imports
- `apps/backoffice/src/` — no imports

Only reference was in `lib/uploader/file-storage.ts` itself (comment noting it was moved from `image-storage.ts`).

### Actions Taken

1. Deleted `apps/api/src/lib/image-storage.ts`
2. Verified typecheck passes
3. Verified build passes
4. Ran full unit test suite — **171/171 tests pass**

### Completion Notes

✅ All acceptance criteria satisfied:
- AC1: No imports of image-storage.ts remain ✅
- AC2: `image-storage.ts` deleted ✅
- AC3: All functionality still works — 171 tests pass, typecheck + build pass ✅

## File List

| File | Action |
|------|--------|
| `apps/api/src/lib/image-storage.ts` | Deleted |
