# Story 37.1: Generic Uploader Core

Status: done

## Story

As a **developer**,
I want a reusable `lib/uploader/` module with typed interfaces and clean separation of concerns (storage, validation, processing, orchestration),
So that any entity type can use the same upload/delete infrastructure without duplicating logic.

## Context

Epic 37 builds a generic file uploader. This story creates the core module:

```
lib/uploader/
├── types.ts              — Interfaces: UploadRequest, UploadResult, DeleteRequest, StorageProvider
├── file-storage.ts       — LocalStorageProvider (moved from image-storage.ts) + generateFileKey()
├── file-validator.ts     — Pure validation: MIME type + size
├── sharp-processor.ts    — Image resize pipeline (opt-in)
└── index.ts              — uploadFile(), deleteFile() orchestrator
```

**Key design decisions:**
- File key structure: `companies/{companyId}/{entityType}/{entityId}/{size}/{filename}`
- `size` = `original` for non-resized uploads, or custom size names (e.g., `thumbnail`, `large`)
- Sharp processing **opt-in** via `resize` option in UploadRequest
- `StorageProvider` interface is runtime-agnostic (LocalStorage now, S3 later)

## Acceptance Criteria

**AC1: `types.ts` defines typed interfaces**
**Given** a developer imports from `lib/uploader/types`
**Then** they have access to `UploadRequest`, `UploadResult`, `DeleteRequest`, `ResizeConfig`, `StorageProvider`

**AC2: `generateFileKey()` produces correct structure**
**Given** `generateFileKey(companyId=1, entityType='item_image', entityId=99, filename='photo.jpg', size='original')`
**Then** result is `companies/1/item_image/99/original/{timestamp}-{random}-photo.jpg`
**And** the key does NOT contain hardcoded `items` segment

**AC3: `LocalStorageProvider` stores and retrieves files**
**Given** a valid file buffer and key
**When** `provider.store(key, buffer, mimeType)` is called
**Then** the file exists at `{basePath}/{key}` and `provider.getUrl(key)` returns `{baseUrl}/{key}`
**And** `provider.exists(key)` returns `true`

**AC4: `LocalStorageProvider` deletes files**
**Given** a file exists at `{basePath}/{key}`
**When** `provider.delete(key)` is called
**Then** the file no longer exists and `provider.exists(key)` returns `false`

**AC5: `validateFile()` rejects oversized files**
**Given** a buffer of 3MB and `maxSizeBytes = 2 * 1024 * 1024`
**When** `validateFile(buffer, 'image/jpeg', { maxSizeBytes })` is called
**Then** result is `{ valid: false, error: 'File must be under 2MB' }`

**AC6: `validateFile()` rejects disallowed MIME types**
**Given** `allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp']`
**When** `validateFile(buffer, 'application/pdf', { allowedMimeTypes })` is called
**Then** result is `{ valid: false, error: 'Only image/jpeg, image/png, image/webp are allowed' }`

**AC7: `validateFile()` accepts valid files**
**Given** a valid 1MB JPEG buffer and `allowedMimeTypes = ['image/jpeg']`
**When** `validateFile(buffer, 'image/jpeg', { maxSizeBytes: 5MB, allowedMimeTypes: ['image/jpeg'] })` is called
**Then** result is `{ valid: true }`

**AC8: `processImage()` resizes to configured sizes**
**Given** a 2000×1500px JPEG buffer and `resize = { sizes: [{ name: 'thumbnail', width: 100, height: 100, quality: 80 }], format: 'webp' }`
**When** `processImage(buffer, 'image/jpeg', resize)` is called
**Then** returned `thumbnail` Buffer is WebP format and dimensions ≤ 100×100px
**And** `original` key contains the original buffer (unmodified)

**AC9: `processImage()` returns original when no resize config**
**Given** a 2000×1500px JPEG buffer and `resize = undefined`
**When** `processImage(buffer, 'image/jpeg', undefined)` is called
**Then** returned object has single key `original` with the unmodified JPEG buffer

**AC10: `uploadFile()` orchestrates full pipeline**
**Given** a valid UploadRequest with `entityType='item_image'`, `entityId=1`, `mimeType='image/jpeg'`, `resize` configured
**When** `uploadFile(request)` is called
**Then** it: validates → processes image → stores all sizes → returns `{ urls, metadata }`
**And** each URL matches `provider.getUrl(key)` pattern

**AC11: `uploadFile()` returns descriptive metadata**
**Given** an image upload request
**When** `uploadFile(request)` succeeds
**Then** `result.metadata` contains `{ originalName, mimeType, sizeBytes, dimensions: { width, height } }`

**AC12: `deleteFile()` removes all size variants**
**Given** a file was stored at multiple sizes: `original`, `thumbnail`, `large`
**When** `deleteFile({ companyId, entityType, entityId, fileKeys: [keyOriginal, keyThumbnail, keyLarge] })` is called
**Then** all three files are deleted from storage

## Tasks / Subtasks

- [x] Create `lib/uploader/types.ts` with all interfaces
- [x] Create `lib/uploader/file-storage.ts`:
  - [x] Move `LocalStorageProvider` from `lib/image-storage.ts`
  - [x] Update `generateFileKey()` to accept `entityType` instead of hardcoded `items`
  - [x] Remove `S3StorageProvider` (not yet implemented — keep placeholder only)
- [x] Create `lib/uploader/file-validator.ts`:
  - [x] `validateFile()` function with size and MIME type checks
- [x] Create `lib/uploader/sharp-processor.ts`:
  - [x] `processImage()` function with resize pipeline
  - [x] Format conversion (JPEG, PNG, WebP)
  - [x] Quality control
- [x] Create `lib/uploader/index.ts`:
  - [x] `uploadFile()` orchestrator
  - [x] `deleteFile()` function
- [x] Run typecheck and fix errors
- [x] Run build and fix errors

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/lib/uploader/types.ts` | `UploadRequest`, `UploadResult`, `DeleteRequest`, `ResizeConfig`, `StorageProvider` |
| `apps/api/src/lib/uploader/file-storage.ts` | `LocalStorageProvider` + `generateFileKey()` |
| `apps/api/src/lib/uploader/file-validator.ts` | `validateFile()` |
| `apps/api/src/lib/uploader/sharp-processor.ts` | `processImage()` |
| `apps/api/src/lib/uploader/index.ts` | `uploadFile()` + `deleteFile()` |
| `apps/api/__test__/unit/uploader/file-storage.test.ts` | Unit tests for `LocalStorageProvider` + `generateFileKey` |
| `apps/api/__test__/unit/uploader/file-validator.test.ts` | Unit tests for `validateFile` |
| `apps/api/__test__/unit/uploader/sharp-processor.test.ts` | Unit tests for `processImage` |
| `apps/api/__test__/unit/uploader/index.test.ts` | Unit tests for `uploadFile` + `deleteFile` |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/lib/image-storage.ts` | Modify | Keep existing exports as-is (no changes yet — this file is deleted in Story 37.4) |

## Estimated Effort

8h

## Risk Level

Medium — Pure refactoring with no business logic changes. Tests provide safety net.

## Dev Notes

### `types.ts` Interface Draft

```typescript
export type EntityType = 'item_image' | 'static_page' | 'export_file';

export interface ResizeSize {
  name: string;       // e.g., 'thumbnail', 'large'
  width: number;
  height: number;
  quality: number;    // 1-100
}

export interface ResizeConfig {
  sizes: ResizeSize[];
  format?: 'jpeg' | 'png' | 'webp';
}

export interface UploadRequest {
  companyId: number;
  userId: number;
  entityType: EntityType;
  entityId: number;
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  options?: {
    maxSizeBytes?: number;           // default: 5MB
    allowedMimeTypes?: string[];    // default: image types
    resize?: ResizeConfig;          // optional resize pipeline
    variantId?: number;             // item_images specific (future)
  };
}

export interface UploadResult {
  urls: Record<string, string>;  // size name → URL
  metadata: {
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    dimensions?: { width: number; height: number };
  };
}

export interface DeleteRequest {
  companyId: number;
  fileKeys: string[];  // storage keys to delete
}
```

### `generateFileKey()` Signature

```typescript
export function generateFileKey(
  companyId: number,
  entityType: EntityType | string,
  entityId: number,
  fileName: string,
  size: string = 'original'
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  const sanitized = baseName.replace(/[^a-zA-Z0-9]/g, '-');
  return `companies/${companyId}/${entityType}/${entityId}/${size}/${timestamp}-${random}-${sanitized}${extension}`;
}
```

### Default MIME Types for Images

```typescript
const DEFAULT_ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DEFAULT_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
```

## Dependencies

- Sharp (already installed)
- Node.js `fs` / `path` (built-in)

## Technical Debt Review

- [x] No shortcuts identified for this story
- [x] S3 storage remains TODO placeholder (not yet implemented)

## Dev Agent Record

### Implementation Plan

1. Created `lib/uploader/types.ts` — all shared interfaces (`UploadRequest`, `UploadResult`, `DeleteRequest`, `ResizeConfig`, `StorageProvider`, `ProcessedImage`, `ValidationResult`)
2. Created `lib/uploader/file-storage.ts` — moved `LocalStorageProvider` from `image-storage.ts`, refactored `generateFileKey()` to accept `entityType` parameter instead of hardcoded `'items'`
3. Created `lib/uploader/file-validator.ts` — pure `validateFile()` function with configurable size and MIME type checks
4. Created `lib/uploader/sharp-processor.ts` — `processImage()` with opt-in resize pipeline (generates multiple size variants + format conversion)
5. Created `lib/uploader/index.ts` — orchestrator with `uploadFile()` and `deleteFile()`, singleton storage provider with `setStorageProvider()`/`resetStorageProvider()` for testing
6. Created unit tests for all 4 modules (144 tests total, all passing)

### Bugs Fixed

- **Bug**: `processImage()` didn't include `original` buffer when resize config was provided — fixed by always assigning `buffers["original"] = buffer` before processing sizes

### Completion Notes

✅ All acceptance criteria satisfied:
- AC1: `types.ts` exports all required interfaces ✅
- AC2: `generateFileKey()` produces `companies/{id}/{entityType}/{id}/{size}/{file}` structure (no hardcoded `items`) ✅
- AC3: `LocalStorageProvider.store()` creates file at `{basePath}/{key}`, `getUrl()` returns `{baseUrl}/{key}`, `exists()` returns true ✅
- AC4: `LocalStorageProvider.delete()` removes file, idempotent on missing files ✅
- AC5: `validateFile()` rejects oversized files with descriptive error ✅
- AC6: `validateFile()` rejects disallowed MIME types with list of allowed types ✅
- AC7: `validateFile()` accepts valid files (returns `{ valid: true }`) ✅
- AC8: `processImage()` resizes to configured sizes + converts format ✅
- AC9: `processImage(undefined)` returns `{ original: buffer }` unchanged ✅
- AC10: `uploadFile()` orchestrates validate → process → store → returns URLs ✅
- AC11: `uploadFile()` returns metadata with `originalName`, `mimeType`, `sizeBytes`, `dimensions` ✅
- AC12: `deleteFile()` removes all provided keys ✅

✅ Validation evidence:
- `npm run typecheck -w @jurnapod/api` passes
- `npm run build -w @jurnapod/api` succeeds
- `npm run test:unit -w @jurnapod/api -- --run __test__/unit/uploader/` — 144 tests pass

### Change Log

- Generic uploader core module created (Date: 2026-04-09)

## File List

| File | Action |
|------|--------|
| `apps/api/src/lib/uploader/types.ts` | Created |
| `apps/api/src/lib/uploader/file-storage.ts` | Created |
| `apps/api/src/lib/uploader/file-validator.ts` | Created |
| `apps/api/src/lib/uploader/sharp-processor.ts` | Created |
| `apps/api/src/lib/uploader/index.ts` | Created |
| `apps/api/__test__/unit/uploader/file-storage.test.ts` | Created |
| `apps/api/__test__/unit/uploader/file-validator.test.ts` | Created |
| `apps/api/__test__/unit/uploader/sharp-processor.test.ts` | Created |
| `apps/api/__test__/unit/uploader/index.test.ts` | Created |
