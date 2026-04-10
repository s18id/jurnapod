# Epic 37: Generic File Uploader

**Status:** done
**Theme:** Platform Infrastructure
**Started:** 2026-04-09
**Completed:** 2026-04-09

## Epic Goal

Extract the current monolithic `item-images.ts` into a layered generic file uploader system with reusable storage, validation, and processing layers — enabling any entity type (item images, static pages, export files, etc.) to use the same upload/delete infrastructure.

## Context

The current `item-images.ts` (`apps/api/src/lib/item-images.ts`) is a monolith: it mixes file validation, Sharp image processing, storage, and DB operations in a single file. There is no `image-storage.ts` yet (was planned but never wired up properly). The system needs to support uploading other file types beyond item images (e.g., static pages, export files) without duplicating upload logic.

**Current state:**
```
item-images.ts (621 lines — monolithic)
├── File validation (MIME type, size)
├── Sharp processing (resize to 4 sizes)
├── LocalStorageProvider (local filesystem)
├── generateFileKey() (hardcoded: companies/{id}/items/{id}/...)
├── DB insert/update/delete for item_images table
└── Audit logging
```

**Target state:**
```
lib/uploader/
├── types.ts              — UploadRequest, UploadResult, StorageProvider interfaces
├── file-storage.ts       — LocalStorageProvider (moved from image-storage.ts)
├── file-validator.ts     — Pure validation (MIME type, size)
├── sharp-processor.ts     — Image resize pipeline (opt-in)
├── index.ts              — uploadFile(), deleteFile() orchestrator
└── adapters/
    └── item-image-adapter.ts  — item_images DB operations

lib/item-images.ts        — Delegates to uploader + adapter (keeps same API)
```

**Key design decisions:**
- File key structure: `companies/{companyId}/{entityType}/{entityId}/{size}/{filename}`
- Sharp processing is **opt-in** per upload (not every entity needs resizing)
- `item-images.ts` keeps the **same public API** (no route changes needed)
- `image-storage.ts` is deleted after migration (no other callers exist)

## Stories

- [Story 37.1](story-37.1.md): Generic Uploader Core
- [Story 37.2](story-37.2.md): Item-Image Adapter
- [Story 37.3](story-37.3.md): Refactor item-images.ts to Use Generic Uploader
- [Story 37.4](story-37.4.md): Delete image-storage.ts (Cleanup)

## Definition of Done

- [x] `lib/uploader/` module exists with clean separation: types, storage, validation, processing, index
- [x] `uploadFile()` is entity-agnostic — accepts any `entityType`
- [x] `deleteFile()` deletes all size variants from storage
- [x] Sharp processing is opt-in via `resize` option
- [x] File key structure uses `{entityType}` instead of hardcoded `items`
- [x] `item-images.ts` routes unchanged (same function signatures)
- [x] `npm run typecheck -w @jurnapod/api` passes
- [x] `npm run build -w @jurnapod/api` succeeds
- [x] `image-storage.ts` deleted (confirmed no other callers)

## Dependencies

- Item images upload API already implemented (Epic 38 — see `inventory-images.ts`)
- Sharp already installed (`apps/api/package.json`)
- `item_images` table already exists (migration 0092)

## Risks

| Risk | Mitigation |
|------|------------|
| Other code references `image-storage.ts` directly | Audit callers before deletion (Story 37.4) |
| Item-images API breaks during refactor | Keep same function signatures, add tests |

## Notes

This epic builds the generic foundation. Future entities (static pages, export files) will reuse `uploadFile()` / `deleteFile()` by implementing their own thin adapter.
