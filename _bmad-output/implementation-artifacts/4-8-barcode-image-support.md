# Story 4.8: Barcode & Image Support

**Epic:** Items & Catalog - Product Management  
**Status:** backlog → ready-for-dev  
**Priority:** Low  
**Estimated Effort:** 6-8 hours  
**Created:** 2026-03-17  
**Type:** Technical Debt

---

## Context

Epic 4's item management currently lacks support for visual product identification (images) and physical product scanning (barcodes). This story adds barcode and image support to items, enabling:
- Faster POS checkout via barcode scanning
- Visual product identification in backoffice
- Integration with external barcode scanners and receipt printers

---

## Story

As a **store manager**,  
I want to **add barcodes and images to items**,  
So that **cashiers can scan products quickly and identify items visually**.

---

## Acceptance Criteria

### Barcode Support

**Given** an item exists  
**When** manager adds a barcode (EAN, UPC, Code128, or custom)  
**Then** barcode is validated and saved

**Given** an item with variants (Story 4.7)  
**When** manager assigns barcode to specific variant  
**Then** variant has its own unique barcode

**Given** a barcode entered  
**When** it already exists for another item in the same company  
**Then** error: "Barcode already in use by [item name]"

**Given** a valid barcode  
**When** barcode format is detected  
**Then** appropriate validation is applied:
- EAN-13: 13 digits, checksum validation
- UPC-A: 12 digits, checksum validation
- Code128: Alphanumeric, length 1-48
- Custom: Any format accepted

**Given** a barcode saved  
**When** cashier scans at POS  
**Then** item is found and added to cart

**Given** multiple items with same barcode (edge case)  
**When** cashier scans  
**Then** selection dialog shows matching items

### Image Support

**Given** an item exists  
**When** manager uploads an image  
**Then** image is stored and associated with the item

**Given** an uploaded image  
**When** image is processed  
**Then** multiple sizes are generated:
- Original (preserved)
- Large (800x800 max)
- Medium (400x400 max)
- Thumbnail (100x100 max)

**Given** an image uploaded  
**When** format is not supported  
**Then** error: "Only JPG, PNG, WebP images supported"

**Given** an image uploaded  
**When** file size exceeds 5MB  
**Then** error: "Image must be under 5MB"

**Given** an item with images  
**When** manager views item details  
**Then** thumbnail is displayed

**Given** an item with images  
**When** cashier views item in POS  
**Then** thumbnail helps identify product

**Given** an item with multiple images  
**When** viewing in backoffice  
**Then** gallery view with image navigation

**Given** an image  
**When** manager deletes it  
**Then** image is removed from storage and associations

### POS Integration

**Given** an item with barcode  
**When** cashier uses barcode search  
**Then** item is found instantly

**Given** a barcode scanned  
**When** multiple variants have same barcode (parent barcode)  
**Then** variant selection screen appears

**Given** items with images  
**When** POS displays item grid  
**Then** thumbnails show alongside item names

**Given** no network connectivity  
**When** cashier tries to scan barcode  
**Then** locally cached item data is used

### Print Integration

**Given** barcode data available  
**When** manager prints barcode labels  
**Then** printable format generated (PDF/SVG)

**Given** label printing  
**When** format selected (various label sizes)  
**Then** barcode scales appropriately

---

## Technical Design

### Database Schema

```sql
-- Migration: 0XXX_add_barcode_to_items.sql
-- Add barcode to existing items table
ALTER TABLE items
  ADD COLUMN barcode VARCHAR(100) NULL AFTER sku,
  ADD COLUMN barcode_type ENUM('EAN13', 'UPCA', 'CODE128', 'CUSTOM') NULL AFTER barcode,
  ADD INDEX idx_barcode (company_id, barcode);

-- Migration: 0XXX_create_item_images.sql
CREATE TABLE item_images (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NULL, -- Optional: for variant-specific images
  file_name VARCHAR(255) NOT NULL,
  original_url VARCHAR(500) NOT NULL,
  large_url VARCHAR(500) NULL,
  medium_url VARCHAR(500) NULL,
  thumbnail_url VARCHAR(500) NULL,
  file_size_bytes INT UNSIGNED NOT NULL,
  mime_type VARCHAR(50) NOT NULL,
  width_pixels INT UNSIGNED NULL,
  height_pixels INT UNSIGNED NULL,
  is_primary BOOLEAN DEFAULT FALSE, -- Main image for item
  sort_order INT DEFAULT 0,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES item_variants(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id),
  
  INDEX idx_item (company_id, item_id, sort_order),
  INDEX idx_variant (company_id, variant_id),
  INDEX idx_primary (company_id, item_id, is_primary)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### API Design

```typescript
// Barcode Management
// PATCH /api/inventory/items/[itemId]/barcode
interface UpdateBarcodeRequest {
  barcode: string;
  barcode_type: 'EAN13' | 'UPCA' | 'CODE128' | 'CUSTOM';
}

// GET /api/inventory/items/lookup/barcode/[barcode]
interface BarcodeLookupResponse {
  items: Array<{
    id: number;
    name: string;
    sku: string;
    barcode: string;
    base_price: number;
    image_thumbnail_url: string | null;
    variants?: Array<{
      id: number;
      sku: string;
      variant_name: string;
      barcode: string;
      price: number;
    }>;
  }>;
}

// Image Management
// POST /api/inventory/items/[itemId]/images
// Content-Type: multipart/form-data
interface UploadImageRequest {
  image: File;
  is_primary?: boolean;
  variant_id?: number; // Optional variant association
}

interface UploadImageResponse {
  id: number;
  item_id: number;
  file_name: string;
  original_url: string;
  large_url: string;
  medium_url: string;
  thumbnail_url: string;
  width_pixels: number;
  height_pixels: number;
  is_primary: boolean;
}

// GET /api/inventory/items/[itemId]/images
interface ItemImagesResponse {
  images: Array<{
    id: number;
    file_name: string;
    original_url: string;
    large_url: string;
    medium_url: string;
    thumbnail_url: string;
    width_pixels: number;
    height_pixels: number;
    file_size_bytes: number;
    is_primary: boolean;
    sort_order: number;
    created_at: string;
  }>;
}

// PATCH /api/inventory/images/[imageId]
interface UpdateImageRequest {
  is_primary?: boolean;
  sort_order?: number;
}

// DELETE /api/inventory/images/[imageId]
// No body - deletes image

// Barcode Label Generation
// GET /api/inventory/items/[itemId]/barcode-label?format=[FORMAT]
// Query params: format (LABEL_2X1, LABEL_3X2, SHEET_A4)
// Returns: PDF or SVG

// POS Sync Support
// Barcodes included in item sync payload
// Thumbnail URLs included for offline caching
```

### Service Layer

```typescript
// apps/api/src/lib/item-barcodes.ts

interface BarcodeValidationResult {
  valid: boolean;
  type: 'EAN13' | 'UPCA' | 'CODE128' | 'CUSTOM' | null;
  error?: string;
}

// Barcode validation
function validateBarcode(barcode: string): BarcodeValidationResult;
function detectBarcodeType(barcode: string): 'EAN13' | 'UPCA' | 'CODE128' | 'CUSTOM';
function validateEAN13(barcode: string): boolean;
function validateUPCA(barcode: string): boolean;

// Barcode operations
async function updateItemBarcode(
  companyId: number,
  itemId: number,
  barcode: string,
  barcodeType?: string
): Promise<Item>;

async function findItemsByBarcode(
  companyId: number,
  barcode: string
): Promise<Array<Item & { variants?: ItemVariant[] }>>;

async function checkBarcodeUnique(
  companyId: number,
  barcode: string,
  excludeItemId?: number
): Promise<{ unique: boolean; existingItem?: Item }>;

// apps/api/src/lib/item-images.ts

interface ItemImage {
  id: number;
  companyId: number;
  itemId: number;
  variantId: number | null;
  fileName: string;
  originalUrl: string;
  largeUrl: string | null;
  mediumUrl: string | null;
  thumbnailUrl: string | null;
  fileSizeBytes: number;
  mimeType: string;
  widthPixels: number | null;
  heightPixels: number | null;
  isPrimary: boolean;
  sortOrder: number;
}

// Image operations
async function uploadItemImage(
  companyId: number,
  itemId: number,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  uploadedBy: number,
  options?: {
    isPrimary?: boolean;
    variantId?: number;
  }
): Promise<ItemImage>;

async function getItemImages(
  companyId: number,
  itemId: number
): Promise<ItemImage[]>;

async function updateImage(
  companyId: number,
  imageId: number,
  updates: Partial<Pick<ItemImage, 'isPrimary' | 'sortOrder'>>
): Promise<ItemImage>;

async function deleteImage(
  companyId: number,
  imageId: number
): Promise<void>;

async function setPrimaryImage(
  companyId: number,
  itemId: number,
  imageId: number
): Promise<void>;

// Image processing
async function processImageUpload(
  fileBuffer: Buffer,
  mimeType: string
): Promise<{
  original: Buffer;
  large: Buffer;
  medium: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
}>;

// Storage
async function storeImageFile(
  companyId: number,
  itemId: number,
  size: 'original' | 'large' | 'medium' | 'thumbnail',
  buffer: Buffer,
  fileName: string
): Promise<string>; // Returns URL
```

---

## Implementation Tasks

### 1. Database (30 min)
- [ ] Add barcode columns to items table
- [ ] Create item_images table
- [ ] Add indexes for barcode lookups
- [ ] Test migrations on MySQL and MariaDB

### 2. Image Processing & Storage (2 hours)
- [ ] Set up image processing library (Sharp)
- [ ] Implement image resizing pipeline
- [ ] Implement storage backend abstraction:
  - Local filesystem (development)
  - S3-compatible storage (production)
- [ ] Add image upload validation
- [ ] Add image format/size restrictions

### 3. Barcode Service (1 hour)
- [ ] Create `item-barcodes.ts` service
- [ ] Implement barcode validation (EAN-13, UPC-A, Code128)
- [ ] Implement barcode uniqueness checking
- [ ] Add barcode lookup functions
- [ ] Add audit logging

### 4. Image Service (1 hour)
- [ ] Create `item-images.ts` service
- [ ] Implement image upload with processing
- [ ] Implement image CRUD operations
- [ ] Add primary image management
- [ ] Add audit logging

### 5. API Routes (1.5 hours)
- [ ] `PATCH /inventory/items/[itemId]/barcode`
- [ ] `GET /inventory/items/lookup/barcode/[barcode]`
- [ ] `POST /inventory/items/[itemId]/images`
- [ ] `GET /inventory/items/[itemId]/images`
- [ ] `PATCH /inventory/images/[imageId]`
- [ ] `DELETE /inventory/images/[imageId]`
- [ ] `GET /inventory/items/[itemId]/barcode-label`
- [ ] Add Zod validation schemas

### 6. UI Components (2-3 hours)
- [ ] Barcode input with format detection
- [ ] Barcode scanner simulation for testing
- [ ] Image upload component with preview
- [ ] Image gallery with reordering
- [ ] Primary image selector
- [ ] Barcode label print preview

### 7. POS Integration (30 min)
- [ ] Add barcode search to POS
- [ ] Show item thumbnails in POS item grid
- [ ] Cache thumbnail images offline

### 8. Testing (30 min)
- [ ] Unit tests for barcode validation
- [ ] API integration tests
- [ ] Image upload/processing tests
- [ ] Barcode lookup tests

---

## Files to Create/Modify

### New Files
```
packages/db/migrations/0XXX_add_barcode_to_items.sql
packages/db/migrations/0XXX_create_item_images.sql
apps/api/src/lib/item-barcodes.ts
apps/api/src/lib/item-barcodes.test.ts
apps/api/src/lib/item-images.ts
apps/api/src/lib/item-images.test.ts
apps/api/src/lib/image-storage.ts
apps/api/app/api/inventory/items/[itemId]/barcode/route.ts
apps/api/app/api/inventory/items/lookup/barcode/[barcode]/route.ts
apps/api/app/api/inventory/items/[itemId]/images/route.ts
apps/api/app/api/inventory/images/[imageId]/route.ts
apps/api/app/api/inventory/items/[itemId]/barcode-label/route.ts
apps/backoffice/src/features/item-barcode-manager.tsx
apps/backoffice/src/features/item-image-gallery.tsx
apps/backoffice/src/features/image-upload.tsx
apps/pos/src/components/barcode-scanner.tsx
```

### Modified Files
```
apps/backoffice/src/features/items-page.tsx
  - Add barcode input field
  - Add image gallery section

apps/pos/src/components/item-grid.tsx
  - Show thumbnails

apps/pos/src/lib/cart.ts
  - Support barcode scanning

apps/api/src/lib/pos-sync.ts
  - Include barcodes and thumbnail URLs in sync
```

---

## Dependencies

- ✅ Items table exists
- ✅ POS sync infrastructure exists
- 🔧 Variant support (Story 4.7) - optional for variant barcodes
- 📦 Sharp library for image processing
- 📦 bwip-js or similar for barcode generation

---

## Dev Notes

### Barcode Validation
```typescript
function validateEAN13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) return false;
  
  // Checksum calculation
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(barcode[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checksum = (10 - (sum % 10)) % 10;
  
  return checksum === parseInt(barcode[12]);
}

function validateUPCA(barcode: string): boolean {
  if (!/^\d{12}$/.test(barcode)) return false;
  
  // Similar checksum logic for UPC-A
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += parseInt(barcode[i]) * (i % 2 === 0 ? 3 : 1);
  }
  const checksum = (10 - (sum % 10)) % 10;
  
  return checksum === parseInt(barcode[11]);
}
```

### Image Processing Pipeline
```typescript
import sharp from 'sharp';

async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  const metadata = await sharp(buffer).metadata();
  
  const sizes = {
    original: buffer,
    large: await sharp(buffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer(),
    medium: await sharp(buffer)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer(),
    thumbnail: await sharp(buffer)
      .resize(100, 100, { fit: 'cover' })
      .jpeg({ quality: 75 })
      .toBuffer()
  };
  
  return {
    sizes,
    width: metadata.width || 0,
    height: metadata.height || 0
  };
}
```

### Storage Abstraction
```typescript
interface StorageProvider {
  store(key: string, buffer: Buffer, mimeType: string): Promise<string>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}

class LocalStorageProvider implements StorageProvider {
  constructor(private basePath: string, private baseUrl: string) {}
  
  async store(key: string, buffer: Buffer): Promise<string> {
    const fullPath = path.join(this.basePath, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return `${this.baseUrl}/${key}`;
  }
  
  // ... other methods
}

class S3StorageProvider implements StorageProvider {
  // S3 implementation
}
```

### Barcode Generation for Printing
```typescript
import bwipjs from 'bwip-js';

async function generateBarcodeSVG(
  barcode: string,
  format: 'EAN13' | 'UPCA' | 'CODE128'
): Promise<string> {
  const svg = await bwipjs.toSVG({
    bcid: format.toLowerCase(),
    text: barcode,
    scale: 3,
    height: 10,
    includetext: true,
    textxalign: 'center'
  });
  
  return svg;
}
```

### POS Barcode Search
```typescript
// In POS local cache
interface CachedItem {
  id: number;
  name: string;
  barcode: string;
  thumbnail_url: string | null;
  // ... other fields
}

// Barcode lookup in POS
function findItemByBarcode(barcode: string): CachedItem | null {
  // Search in Dexie/local storage
  const items = await db.items.where('barcode').equals(barcode).toArray();
  
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  
  // Multiple matches - show selection dialog
  showItemSelectionDialog(items);
  return null;
}
```

---

## Definition of Done

- [ ] Database migration created and tested
- [ ] Barcode validation working for all formats
- [ ] Barcode uniqueness enforcement working
- [ ] Image upload and processing pipeline working
- [ ] Multiple image sizes generated
- [ ] API endpoints with validation
- [ ] UI for managing barcodes and images
- [ ] POS barcode search integrated
- [ ] POS thumbnail display working
- [ ] Barcode label printing support
- [ ] Tests passing
- [ ] Code review completed
- [ ] Documentation updated

---

**Story Status:** Ready for Development 🔧  
**Next Step:** Delegate to `bmad-dev-story` when ready to implement
