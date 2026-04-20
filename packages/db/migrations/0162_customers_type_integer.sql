-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0162_customers_type_integer
-- Description: Convert customers.type from ENUM('PERSON','BUSINESS') to TINYINT UNSIGNED
--              using integer constants (PERSON=1, BUSINESS=2) following the pattern
--              used for inventory_transactions.transaction_type.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: yes

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ==============================================================================
-- STEP 1: Check current column type and convert if needed
-- ==============================================================================

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'customers'
    AND column_name = 'type'
);

SET @col_type = (
  SELECT COLUMN_TYPE FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'customers'
    AND column_name = 'type'
);

-- Only modify if column exists and is still ENUM
SET @alter_sql = IF(@col_exists > 0 AND @col_type = 'enum(''PERSON'',''BUSINESS'')',
  'ALTER TABLE `customers` MODIFY COLUMN `type` TINYINT UNSIGNED NOT NULL DEFAULT 1',
  'SELECT ''type column already converted or does not exist'' AS status'
);

PREPARE stmt FROM @alter_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ==============================================================================
-- STEP 2: No UPDATE needed
-- ALTER TABLE MODIFY COLUMN from ENUM to TINYINT automatically converts
-- internal ENUM index values to integers:
--   'PERSON'  (ENUM index 1) -> TINYINT 1
--   'BUSINESS' (ENUM index 2) -> TINYINT 2
-- Running UPDATEs after ALTER would compare string literals against TINYINT,
-- causing "Truncated incorrect DOUBLE value" warnings. Removed for correctness.
-- ==============================================================================

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
