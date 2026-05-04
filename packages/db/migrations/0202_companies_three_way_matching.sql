-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0202_companies_three_way_matching.sql
-- Story 54.6 (D54-001): Add three_way_matching flag to companies
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'companies'
    AND column_name = 'three_way_matching'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE companies ADD COLUMN three_way_matching TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
