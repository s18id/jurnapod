# Story 20.6: Item Variant EAV Cleanup

**Status:** done  
**Epic:** Epic 20  
**Story Points:** 5  
**Priority:** P2  
**Risk:** MEDIUM  
**Assigned:** unassigned  

---

## Overview

Replace the EAV (Entity-Attribute-Value) pattern for item variants with a JSON `attributes` column in `item_variants`. Migrate data from `item_variant_attributes`, `item_variant_attribute_values`, and `item_variant_combinations` tables.

## Technical Details

### Database Changes

```sql
-- Add attributes JSON column to item_variants
ALTER TABLE item_variants
    ADD COLUMN attributes JSON NULL COMMENT 'Normalized variant attributes as JSON',
    ADD COLUMN combination_hash VARCHAR(64) NULL COMMENT 'Hash of attribute combination for deduplication',
    ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Create index for combination lookups
CREATE INDEX idx_item_variants_combination_hash ON item_variants (combination_hash);

-- Migration: Build attributes JSON from EAV tables
-- Step 1: Build attribute values mapping
WITH attribute_values AS (
    SELECT 
        iav.item_variant_id,
        JSON_OBJECT(
            ia.attribute_code,
            iav.value
        ) AS attribute_json
    FROM item_variant_attribute_values iav
    JOIN item_variant_attributes ia ON iav.attribute_id = ia.id
),
variant_attributes AS (
    SELECT 
        item_variant_id,
        JSON_OBJECTAGG(attribute_code, attr_value) WITHIN GROUP (ORDER BY attribute_code) AS attributes
    FROM (
        SELECT 
            item_variant_id,
            JSON_UNQUOTE(JSON_EXTRACT(attribute_json, '$.key')) AS attribute_code,
            JSON_UNQUOTE(JSON_EXTRACT(attribute_json, '$.value')) AS attr_value
        FROM attribute_values
    ) grouped
    GROUP BY item_variant_id
)
UPDATE item_variants iv
JOIN variant_attributes va ON iv.id = va.item_variant_id
SET iv.attributes = va.attributes;

-- Migration: Build combination hash for deduplication
UPDATE item_variants
SET combination_hash = SHA2(attributes, 256)
WHERE attributes IS NOT NULL;

-- Migration: Migrate item_variant_combinations data
-- Combinations are stored as SKUs with specific attribute sets
-- This maps existing combinations to the new attributes format
WITH combinations AS (
    SELECT 
        id AS combination_id,
        item_id,
        SKU,
        attributes_json
    FROM item_variant_combinations
)
UPDATE item_variants iv
JOIN combinations c ON iv.sku = c.sku AND iv.item_id = c.item_id
SET iv.attributes = c.attributes_json,
    iv.combination_hash = SHA2(c.attributes_json, 256);

-- Drop old tables (after verification)
-- DROP TABLE IF EXISTS item_variant_attributes;
-- DROP TABLE IF EXISTS item_variant_attribute_values;
-- DROP TABLE IF EXISTS item_variant_combinations;
```

### Files to Change

| File | Change |
|------|--------|
| `packages/shared/src/db/schema.ts` | Update item_variants definition |
| `apps/api/src/lib/items/variants.ts` | Update variant functions |
| `apps/api/src/lib/items/attributes.ts` | Update attribute functions |
| `apps/api/src/routes/items.ts` | Update route handlers |

### Migration Steps

1. **Add columns**: Add attributes JSON and combination_hash to item_variants
2. **Create index**: Create index for combination_hash lookups
3. **Migrate attributes**: Build JSON from item_variant_attribute_values
4. **Migrate combinations**: Map item_variant_combinations to attributes
5. **Update code**: Update lib/items/variants.ts
6. **Update code**: Update lib/items/attributes.ts
7. **Update routes**: Update items route handlers
8. **Update schema**: Update shared DB schema
9. **Test**: Run variant-related tests
10. **Drop tables**: Drop old EAV tables after verification

## Acceptance Criteria

- [ ] attributes JSON column added to item_variants
- [ ] combination_hash column added for deduplication
- [ ] All item_variant_attributes data migrated to item_variants.attributes
- [ ] All item_variant_attribute_values data migrated
- [ ] All item_variant_combinations data migrated
- [ ] lib/items/variants.ts updated
- [ ] lib/items/attributes.ts updated (may become read-only or deprecated)
- [ ] Route handlers updated
- [ ] No data loss (verify attribute counts)
- [ ] Old EAV tables dropped only after full verification

## Dependencies

- Stories 20.3, 20.4, 20.5 should complete first (quick win pattern established)
