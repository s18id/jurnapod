# Phase 1: Areas Module Implementation Plan

## Overview

This document specifies Phase 1 implementation for the Areas module. Areas provide an organizational grouping layer above outlets, enabling:
- Grouping outlets by city, region, or operational zone
- Area-level reporting and filtering
- Future-proofing for multi-city expansion

### Design Principles

1. **Keep outlet as operational unit**: `outlet_id` remains the key for POS sync, journals, stock, and access control.
2. **Area is a reporting dimension**: No impact on financial posting, POS idempotency, or tenant isolation.
3. **Nullable FK initially**: Existing outlets can remain unassigned to any area (safe rollout).
4. **Backward-safe migration**: Idempotent, works on MySQL 8.0+ and MariaDB.

---

## Schema Design

### Migration: `0099_areas_add_areas_table.sql`

```sql
-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Areas: Organizational grouping layer for outlets
-- Used for multi-city expansion and area-level reporting

CREATE TABLE IF NOT EXISTS areas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(191) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_areas_company_code (company_id, code),
  KEY idx_areas_company_name (company_id, name),
  CONSTRAINT fk_areas_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

-- Add area_id to outlets (nullable for safe rollout)
-- Existing outlets remain unassigned until explicitly linked

ALTER TABLE outlets ADD COLUMN area_id BIGINT UNSIGNED DEFAULT NULL AFTER company_id;

ALTER TABLE outlets ADD CONSTRAINT fk_outlets_area 
  FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL;

ALTER TABLE outlets ADD KEY idx_outlets_company_area (company_id, area_id);

-- Sync trigger: bump data version when areas change
-- (reuses existing sync_data_versions table pattern)

DELIMITER //

CREATE TRIGGER trg_areas_after_insert
AFTER INSERT ON areas
FOR EACH ROW
BEGIN
  INSERT INTO sync_data_versions (company_id, table_name, last_version)
  VALUES (NEW.company_id, 'areas', UNIX_TIMESTAMP())
  ON DUPLICATE KEY UPDATE last_version = UNIX_TIMESTAMP();
END//

CREATE TRIGGER trg_areas_after_update
AFTER UPDATE ON areas
FOR EACH ROW
BEGIN
  INSERT INTO sync_data_versions (company_id, table_name, last_version)
  VALUES (NEW.company_id, 'areas', UNIX_TIMESTAMP())
  ON DUPLICATE KEY UPDATE last_version = UNIX_TIMESTAMP();
END//

CREATE TRIGGER trg_areas_after_delete
AFTER DELETE ON areas
FOR EACH ROW
BEGIN
  INSERT INTO sync_data_versions (company_id, table_name, last_version)
  VALUES (OLD.company_id, 'areas', UNIX_TIMESTAMP())
  ON DUPLICATE KEY UPDATE last_version = UNIX_TIMESTAMP();
END//

DELIMITER ;
```

### Rollback (if needed)

```sql
-- Safe rollback: remove FK first, then columns
ALTER TABLE outlets DROP FOREIGN KEY fk_outlets_area;
ALTER TABLE outlets DROP COLUMN area_id;
DROP TABLE IF EXISTS areas;
```

---

## Shared Schemas

### File: `packages/shared/src/schemas/areas.ts`

```typescript
// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { z } from "zod";
import { NumericIdSchema } from "./common";

export const AreaFullResponseSchema = z.object({
  id: NumericIdSchema,
  company_id: NumericIdSchema,
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
  is_active: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const AreaCreateRequestSchema = z.object({
  company_id: NumericIdSchema,
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(191),
  is_active: z.boolean().default(true)
});

export const AreaUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional(),
    is_active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const AreaListQuerySchema = z.object({
  company_id: NumericIdSchema,
  is_active: z.boolean().optional()
});

export type AreaFullResponse = z.infer<typeof AreaFullResponseSchema>;
export type AreaCreateRequest = z.infer<typeof AreaCreateRequestSchema>;
export type AreaUpdateRequest = z.infer<typeof AreaUpdateRequestSchema>;
export type AreaListQuery = z.infer<typeof AreaListQuerySchema>;
```

### Update: `packages/shared/src/index.ts`

Add export:

```typescript
export * from "./schemas/areas";
```

---

## API Endpoints

### List Areas
- **GET** `/api/areas?company_id={id}&is_active={bool}`
- **Auth**: Requires `outlets` module read permission
- **Returns**: `AreaFullResponse[]`

### Get Area
- **GET** `/api/areas/:id?company_id={id}`
- **Auth**: Requires `outlets` module read permission
- **Returns**: `AreaFullResponse`

### Create Area
- **POST** `/api/areas`
- **Auth**: Requires `outlets` module create permission
- **Body**: `AreaCreateRequest`
- **Returns**: `AreaFullResponse` (201)

### Update Area
- **PATCH** `/api/areas/:id`
- **Auth**: Requires `outlets` module update permission
- **Body**: `AreaUpdateRequest`
- **Returns**: `AreaFullResponse`

### Delete Area
- **DELETE** `/api/areas/:id?company_id={id}`
- **Auth**: Requires `outlets` module delete permission
- **Cascade**: Sets `outlets.area_id = NULL` (FK ON DELETE SET NULL)
- **Returns**: `null` (204)

---

## Update Existing Endpoints

### GET /api/outlets (list)
- Add optional `area_id` to response
- Add `?area_id={id}` filter query param
- No change to required permissions

### GET /api/outlets/:id
- Add `area_id` to response

### POST /api/outlets (create)
- Add optional `area_id` to request body
- Validate area belongs to same company

### PATCH /api/outlets/:id
- Add optional `area_id` to request body

---

## Backoffice UI

### 1. Areas Management Page
- **Route**: `/areas` (or `/settings/areas`)
- **Features**:
  - List areas with company filter (for super admin)
  - Create/edit/delete areas
  - Toggle active status
  - Search by code/name
- **Permissions**: Same as outlets (create/read/update/delete on `outlets` module)

### 2. Outlet Form Enhancement
- Add "Area" dropdown selector in create/edit outlet modal
- Group outlets list by area (optional toggle)

### 3. Area Filter in Reports
- Add optional area filter where outlet filters exist:
  - Sales reports
  - POS transaction reports
  - Fixed assets (already has outlet filter)
  - Journals (already has outlet filter)

---

## POS Sync Considerations

### Pull (Master Data)
- Add `areas` to sync pull response
- Include only active areas
- POS should cache areas for outlet grouping in UI

### Push
- No changes required (outlet_id unchanged)

### Implementation Note
- Areas are optional: unassigned outlets remain functional
- POS can display area name for context, but outlet_id is the operational key

---

## RBAC / Permissions

### Option A: Reuse Existing Module (Recommended for Phase 1)
- Use `outlets` module permissions for areas
- No changes to module_roles seed
- Rationale: Areas are metadata for outlets; no separate business capability

### Option B: Separate Module (Future)
- Add `"areas"` to `ModuleSchema` in `module-roles.ts`
- Seed permissions for all roles (read: CASHIER+, create/update/delete: ADMIN+)
- Implement only when area becomes a distinct business capability

**Recommended**: Start with Option A, migrate to Option B only when needed.

---

## Testing

### Integration Tests

1. **Area CRUD**
   - Create area with valid company
   - Duplicate code rejection (409)
   - Update area name and is_active
   - Delete area (outlets set to NULL)

2. **Outlet + Area Linking**
   - Create outlet with area_id
   - Update outlet to assign/unassign area
   - Query outlets by area_id filter

3. **Area Filtering**
   - GET /api/outlets?area_id=X returns only outlets in that area
   - Area filter shows correct count

4. **Permissions**
   - User without outlets create permission cannot create area
   - User with outlet read-only can list areas

### Edge Cases

1. **Delete area with outlets**: FK SET NULL handles this gracefully
2. **Assign outlet to inactive area**: Allow (historical accuracy)
3. **Query non-existent area**: Return 404
4. **Cross-company area reference**: FK prevents this

---

## Rollback Strategy

If issues arise:

1. **Immediate**: Revert migration (SQL rollback above)
2. **Data**: Existing `area_id` values lost (acceptable for Phase 1)
3. **Code**: No breaking changes to existing outlets API contracts (area_id is additive)

---

## Success Criteria

- [ ] Migration applies cleanly on MySQL 8.0+ and MariaDB
- [ ] Existing outlets remain functional (no area_id required)
- [ ] Areas CRUD works with proper validation
- [ ] Outlet create/edit supports area assignment
- [ ] Outlet list supports area filter
- [ ] Permission checks work correctly
- [ ] Integration tests pass
- [ ] No regression in POS sync

---

## Future Enhancements (Phase 2+)

- Area-level dashboards (sales by area, outlet ranking)
- Area manager role (view only assigned area outlets)
- Area-level settings (default tax rates, payment methods)
- Address/contact info on area (for multi-city HQ)
