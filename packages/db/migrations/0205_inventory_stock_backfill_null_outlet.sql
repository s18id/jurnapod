-- Migration: 0205_inventory_stock_backfill_null_outlet.sql
-- Purpose: Backfill legacy inventory_stock rows with outlet_id IS NULL into outlet-scoped rows.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Build default outlet mapping per company.
DROP TEMPORARY TABLE IF EXISTS tmp_inventory_default_outlet;
CREATE TEMPORARY TABLE tmp_inventory_default_outlet (
  company_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  outlet_id BIGINT UNSIGNED NOT NULL
);

INSERT INTO tmp_inventory_default_outlet (company_id, outlet_id)
SELECT o.company_id, MIN(o.id) AS outlet_id
FROM outlets o
GROUP BY o.company_id;

-- Merge legacy NULL-outlet stock into existing default-outlet rows when they already exist.
UPDATE inventory_stock target
INNER JOIN tmp_inventory_default_outlet d
  ON d.company_id = target.company_id
INNER JOIN inventory_stock legacy
  ON legacy.company_id = target.company_id
  AND legacy.product_id = target.product_id
  AND legacy.outlet_id IS NULL
SET
  target.quantity = target.quantity + legacy.quantity,
  target.reserved_quantity = target.reserved_quantity + legacy.reserved_quantity,
  target.available_quantity = target.available_quantity + legacy.available_quantity,
  target.updated_at = GREATEST(target.updated_at, legacy.updated_at)
WHERE target.outlet_id = d.outlet_id;

-- Move remaining NULL-outlet rows to default outlet when no destination row exists.
UPDATE inventory_stock legacy
INNER JOIN tmp_inventory_default_outlet d
  ON d.company_id = legacy.company_id
LEFT JOIN inventory_stock existing
  ON existing.company_id = legacy.company_id
  AND existing.product_id = legacy.product_id
  AND existing.outlet_id = d.outlet_id
SET legacy.outlet_id = d.outlet_id
WHERE legacy.outlet_id IS NULL
  AND existing.id IS NULL;

-- Delete legacy NULL-outlet rows that were merged into existing outlet rows.
DELETE legacy
FROM inventory_stock legacy
INNER JOIN tmp_inventory_default_outlet d
  ON d.company_id = legacy.company_id
INNER JOIN inventory_stock existing
  ON existing.company_id = legacy.company_id
  AND existing.product_id = legacy.product_id
  AND existing.outlet_id = d.outlet_id
WHERE legacy.outlet_id IS NULL;

DROP TEMPORARY TABLE IF EXISTS tmp_inventory_default_outlet;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
