-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0200_ap_payment_lines_full_settlement.sql
-- Story 54.4: Add full_settlement flag to ap_payment_lines for FX variance posting
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ap_payment_lines'
    AND column_name = 'full_settlement'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE ap_payment_lines ADD COLUMN full_settlement TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
