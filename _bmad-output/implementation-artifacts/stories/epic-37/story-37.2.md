# Story 37.2: Item-Image Adapter

Status: done

## Story

As a **developer**,
I want an `adapters/item-image-adapter.ts` that wraps `uploadFile()` with `item_images` table operations,
So that `item-images.ts` can delegate to it and remain thin.

## Context

Story 37.1 created the generic `uploader/` core. This story creates the first entity-specific adapter.

The adapter pattern:
```
item-images.ts (route handler)
  → uploadItemImage()
    → itemImageAdapter.upload()       ← NEW (this story)
      → uploader.uploadFile()         ← Story 37.1
      → DB insert into item_images
```

**Responsibilities of the adapter:**
1. Call `uploadFile()` with entityType='item_image' and item-specific resize config
2. Insert DB record into `item_images` table
3. Return combined result (urls + db record id)
4. Handle item-images-specific fields: `variant_id`, `is_primary`, `sort_order`

The adapter is **transactional**: if DB insert fails, it should delete the stored files (cleanup).

## Acceptance Criteria

**AC1: Adapter calls uploadFile() with correct entityType**
**Given** an upload request for item ID 99
**When** `itemImageAdapter.upload(request)` is called
**Then** it calls `uploadFile()` with `entityType='item_image'` and `entityId=99`

**AC2: Adapter performs DB insert**
**Given** a successful file upload
**When** `itemImageAdapter.upload(request)` is called
**Then** it inserts a row into `item_images` with: `company_id`, `item_id`, `file_name`, `original_url`, `large_url`, `medium_url`, `thumbnail_url`, `file_size_bytes`, `mime_type`, `width_pixels`, `height_pixels`, `is_primary`, `sort_order`, `uploaded_by`

**AC3: Adapter handles variant_id**
**Given** an upload request with `variantId=5`
**When** `itemImageAdapter.upload(request)` is called
**Then** the inserted `item_images` row has `variant_id=5`

**AC4: Adapter handles is_primary flag**
**Given** an upload request with `isPrimary=true`
**When** `itemImageAdapter.upload(request)` is called
**Then** the inserted `item_images` row has `is_primary=true`

**AC5: Adapter calculates sort_order**
**Given** an upload request for item ID 99 with no explicit sort_order
**When** `itemImageAdapter.upload(request)` is called
**Then** the inserted `item_images` row has `sort_order = MAX(existing sort_order for item) + 1`

**AC6: Adapter cleans up files on DB failure (transactional)**
**Given** a file upload succeeds but DB insert fails
**When** `itemImageAdapter.upload(request)` is called
**Then** all stored files (original, large, medium, thumbnail) are deleted
**And** the error is propagated to the caller

**AC7: Adapter returns combined result**
**Given** a successful upload
**When** `itemImageAdapter.upload(request)` completes
**Then** result includes: `{ id: number, urls: Record<string,string>, metadata: {...} }`
**Where** `id` is the inserted `item_images.id`

## Tasks / Subtasks

- [x] Create `lib/uploader/adapters/` directory
- [x] Create `lib/uploader/adapters/item-image-adapter.ts`:
  - [x] `uploadItemImageAdapter()` — calls `uploadFile()` + DB insert in transaction
  - [x] `deleteItemImageAdapter()` — deletes DB record + calls `uploader.deleteFile()`
  - [x] `updateItemImageAdapter()` — updates DB record metadata (is_primary, sort_order)
  - [x] `setPrimaryItemImageAdapter()` — sets is_primary=true for target, is_primary=false for others
- [x] Write unit tests for adapter logic (mock uploader)
- [x] Run typecheck and fix errors

## Files to Create

| File | Description |
|------|-------------|
| `apps/api/src/lib/uploader/adapters/item-image-adapter.ts` | Item-image specific adapter |
| `apps/api/__test__/unit/uploader/item-image-adapter.test.ts` | Unit tests for adapter |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| None | | This story only creates files; integration happens in Story 37.3 |

## Estimated Effort

4h

## Risk Level

Low — Adapter is thin, tested in isolation

## Dev Notes

### Adapter Interface Draft

```typescript
// lib/uploader/adapters/item-image-adapter.ts

interface ItemImageUploadOptions {
  variantId?: number;
  isPrimary?: boolean;
  sortOrder?: number;
}

interface ItemImageUploadResult {
  id: number;
  urls: Record<string, string>;
  metadata: {
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    dimensions?: { width: number; height: number };
  };
}

export async function uploadItemImageAdapter(
  companyId: number,
  itemId: number,
  userId: number,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  options: ItemImageUploadOptions = {}
): Promise<ItemImageUploadResult> {
  // 1. Call uploadFile() with entityType='item_image'
  // 2. Begin transaction
  // 3. Insert into item_images
  // 4. Commit transaction
  // 5. Return combined result
  // On failure: delete stored files, rollback transaction, re-throw
}
```

### Default Resize Config for Item Images

```typescript
const ITEM_IMAGE_RESIZE = {
  sizes: [
    { name: 'large',    width: 800,  height: 800,  quality: 85 },
    { name: 'medium',  width: 400,  height: 400,  quality: 80 },
    { name: 'thumbnail', width: 100, height: 100, quality: 75 },
  ],
  format: 'webp' as const,
};
```

## Dependencies

- Story 37.1 (generic uploader core must be complete first)
- `item_images` table (migration 0092 already applied)

## Dev Agent Record

### Completion Notes

**Implementation Summary:**
- Created `item-image-adapter.ts` with 4 exported functions: `uploadItemImageAdapter`, `deleteItemImageAdapter`, `updateItemImageAdapter`, `setPrimaryItemImageAdapter`
- Uses Kysely for DB operations with proper `company_id` tenant scoping
- Transactional cleanup: if DB insert fails after files are stored, `deleteFile()` is called to remove all stored files
- `sortOrder` auto-calculated as MAX+1 when not provided
- `isPrimary=true` unsets existing primary for item in same transaction
- `setPrimaryItemImageAdapter` uses efficient two-query approach (unset all, then set target)

**Files Created:**
- `apps/api/src/lib/uploader/adapters/item-image-adapter.ts` (290 lines)
- `apps/api/__test__/unit/uploader/item-image-adapter.test.ts` (266 lines)

**Key Design Decisions:**
- Boolean `is_primary` stored as 0/1 (MySQL BOOLEAN equivalent) to avoid Kysely type issues with Generated columns
- `extractFileKeysFromUrls()` helper strips baseUrl prefix to convert URLs back to storage keys for deletion
- Adapter exports types `ItemImageUploadOptions` and `ItemImageUploadResult` for consumer use

**Test Results:**
- All 10 tests passing
- Typecheck passes
- Build passes