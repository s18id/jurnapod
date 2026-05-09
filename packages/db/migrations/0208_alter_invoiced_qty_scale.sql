-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0208_alter_invoiced_qty_scale.sql
-- Epic 61 A2: Change invoiced_qty from DECIMAL(19,4) to DECIMAL(19,2)
-- Rationale: invoiced_qty is a non-monetary quantity accumulator — 4 decimal places
--   is excessive for unit quantities. 2 decimal places is sufficient (e.g., 1.25 units).
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET @col_is_scale4 = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'purchase_order_lines'
    AND column_name = 'invoiced_qty'
    AND column_type = 'decimal(19,4)'
);

SET @sql_alter = IF(@col_is_scale4 > 0,
  'ALTER TABLE purchase_order_lines MODIFY COLUMN invoiced_qty DECIMAL(19,2) NOT NULL DEFAULT 0.00',
  'SELECT 1'
);

PREPARE stmt FROM @sql_alter;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
