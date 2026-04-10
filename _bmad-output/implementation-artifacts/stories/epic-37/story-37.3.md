# Story 37.3: Refactor item-images.ts to Use Generic Uploader

Status: done

## Story

As a **developer**,
I want `lib/item-images.ts` refactored to delegate to the new generic uploader and item-image adapter,
So that the existing upload API routes continue to work unchanged while the internal implementation is properly layered.

## Context

This story refactors `lib/item-images.ts` — the existing monolithic file — to use the layered architecture built in Stories 37.1 and 37.2.

**Before:**
```typescript
// lib/item-images.ts (monolithic)
export async function uploadItemImage(...) {
  // All logic in one function:
  // - validateFileSize()
  // - processImage() // sharp
  // - LocalStorageProvider.store() // hardcoded
  // - DB insert
}
```

**After:**
```typescript
// lib/item-images.ts (delegator — thin)
import { uploadItemImageAdapter } from './uploader/adapters/item-image-adapter.js';

export async function uploadItemImage(...) {
  // Thin wrapper only:
  // - Map params to adapter
  // - Return result
}
```

**CRITICAL CONSTRAINT:** The public API of `item-images.ts` MUST remain identical. Routes in `inventory-images.ts` must not change. This is a refactor, not a rewrite.

## Acceptance Criteria

**AC1: Function signatures unchanged**
**Given** `lib/item-images.ts` is refactored
**When** I examine `uploadItemImage`, `getItemImages`, `getImageById`, `updateImage`, `deleteImage`, `setPrimaryImage`
**Then** each function has the same signature as before the refactor

**AC2: `uploadItemImage()` delegates to adapter**
**Given** a call to `uploadItemImage(companyId, itemId, fileBuffer, fileName, mimeType, userId, options)`
**When** the function executes
**Then** it calls `itemImageAdapter.upload(companyId, itemId, userId, fileBuffer, fileName, mimeType, options)`
**And** returns the adapter's result

**AC3: `deleteImage()` delegates to adapter**
**Given** a call to `deleteImage(companyId, imageId, userId)`
**When** the function executes
**Then** it calls `itemImageAdapter.delete(companyId, imageId, userId)`
**And** returns the adapter's result

**AC4: `setPrimaryImage()` delegates to adapter**
**Given** a call to `setPrimaryImage(companyId, itemId, imageId, userId)`
**When** the function executes
**Then** it calls `itemImageAdapter.setPrimary(companyId, itemId, imageId, userId)`
**And** returns the adapter's result

**AC5: `updateImage()` delegates to adapter**
**Given** a call to `updateImage(companyId, imageId, updates, userId)`
**When** the function executes
**Then** it calls `itemImageAdapter.update(companyId, imageId, updates, userId)`
**And** returns the adapter's result

**AC6: `getItemImages()` and `getImageById()` still work**
**Given** `getItemImages()` and `getImageById()` are read-only functions
**When** they are called
**Then** they continue to return data from the `item_images` table unchanged

**AC7: All existing routes still work without changes**
**Given** `inventory-images.ts` routes
**When** I make requests to all image endpoints
**Then** they all return the same responses as before the refactor

**AC8: No duplicate code**
**Given** the refactored `item-images.ts`
**When** I count lines of code
**Then** it is significantly smaller (target: ~150 lines from ~621)
**And** all file validation, storage, and processing logic is removed

## Tasks / Subtasks

- [x] Refactor `uploadItemImage()` to delegate to `itemImageAdapter.upload()`
- [x] Refactor `deleteImage()` to delegate to `itemImageAdapter.delete()`
- [x] Refactor `setPrimaryImage()` to delegate to `itemImageAdapter.setPrimary()`
- [x] Refactor `updateImage()` to delegate to `itemImageAdapter.update()`
- [x] Keep `getItemImages()` and `getImageById()` as-is (read-only, no delegation needed)
- [x] Remove all code from `item-images.ts` that is now handled by uploader/adapter:
  - [x] Remove `validateFile()` — now in `file-validator.ts`
  - [x] Remove Sharp processing — now in `sharp-processor.ts`
  - [x] Remove `LocalStorageProvider` — now in `file-storage.ts`
  - [x] Remove `generateFileKey()` — now in `file-storage.ts`
  - [x] Remove audit log insertion — now in adapter
- [x] Update imports in `item-images.ts`
- [x] Verify all callers still work (run existing tests)
- [x] Run typecheck and fix errors
- [x] Run build and fix errors

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/lib/item-images.ts` | Refactor | Delegate to adapter; remove monolithic logic |

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/__test__/unit/item-images/item-images.test.ts` | Unit tests confirming same behavior (no regression) |

## Estimated Effort

4h

## Risk Level

Medium-High — This is the most critical refactor. Routes must not break. Test coverage is essential.

## Dev Notes

### Expected Refactored Shape

```typescript
// lib/item-images.ts — AFTER REFACTOR (~150 lines)
import {
  uploadItemImageAdapter,
  deleteItemImageAdapter,
  updateItemImageAdapter,
  setPrimaryItemImageAdapter,
} from './uploader/adapters/item-image-adapter.js';
import { db } from './db.js';

export async function uploadItemImage(
  companyId: number,
  itemId: number,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  userId: number,
  options?: { isPrimary?: boolean; variantId?: number }
) {
  return uploadItemImageAdapter(companyId, itemId, userId, fileBuffer, fileName, mimeType, options);
}

export async function deleteImage(companyId: number, imageId: number, userId: number) {
  return deleteItemImageAdapter(companyId, imageId, userId);
}

// ... etc
```

## Dependencies

- Story 37.1 (uploader core)
- Story 37.2 (item-image adapter)
- `inventory-images.ts` routes (must continue working)

## Dev Agent Record

### Implementation Summary

Refactored `item-images.ts` from 621 lines to ~200 lines by:
1. Removing all inline validation, sharp processing, storage logic, and DB operations
2. Delegating upload/delete/update/setPrimary to the item-image adapter
3. Keeping `getItemImages()` and `getImageById()` as read-only DB queries
4. Keeping `verifyItemOwnership()` and `CrossTenantAccessError` for pre-authorization

### Key Changes

- `uploadItemImage()` now delegates to `uploadItemImageAdapter()` and translates result to `UploadImageResponse` shape
- `deleteImage()`, `updateImage()`, `setPrimaryImage()` are thin wrappers calling their respective adapter functions
- `getItemImages()` and `getImageById()` remain unchanged (read-only DB queries)
- Removed imports for `sharp`, `sql`, `createStorageProvider`, `generateFileKey`
- Removed `ALLOWED_MIME_TYPES`, `MAX_FILE_SIZE_BYTES`, `IMAGE_SIZES` constants
- Removed `validateImageUpload()`, `processImage()`, `ProcessedImage` interface

### Tests Added

- Created `apps/api/__test__/unit/item-images/item-images.test.ts` with:
  - Export verification tests
  - Function signature verification tests
  - Thin delegator verification tests
  - Code size verification test (AC8)

### Verification

- Typecheck: ✅ PASSED
- Build: ✅ PASSED
- Unit tests: ✅ 171 passed (including 17 new item-images tests)
