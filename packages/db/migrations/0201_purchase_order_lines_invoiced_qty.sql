-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0201_purchase_order_lines_invoiced_qty.sql
-- Story 54.6 (D54-002): Add invoiced_qty accumulator to purchase_order_lines
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'purchase_order_lines'
    AND column_name = 'invoiced_qty'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE purchase_order_lines ADD COLUMN invoiced_qty DECIMAL(19,4) NOT NULL DEFAULT 0.0000',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
