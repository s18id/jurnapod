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
IF @col_exists > 0 AND @col_type = 'enum(''PERSON'',''BUSINESS'')' THEN
  ALTER TABLE `customers` MODIFY COLUMN `type` TINYINT UNSIGNED NOT NULL DEFAULT 1;
END IF;

-- ==============================================================================
-- STEP 2: Update any existing ENUM string values to integers
-- ==============================================================================

UPDATE `customers` SET `type` = 1 WHERE `type` = 'PERSON';
UPDATE `customers` SET `type` = 2 WHERE `type` = 'BUSINESS';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
