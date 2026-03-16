-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Update inventory_transactions transaction_type to TINYINT
-- Purpose: Use compact numeric type instead of ENUM for flexibility
-- Portable across MySQL 8.0+ and MariaDB
--
-- Transaction Type Mapping:
--   1 = SALE           (Stock reduction from completed sale)
--   2 = REFUND         (Stock increase from void/refund)
--   3 = RESERVATION    (Temporary stock hold during checkout)
--   4 = RELEASE        (Cancel reservation)
--   5 = ADJUSTMENT     (Manual inventory adjustment)
--   6 = RECEIPT        (Stock received from supplier)
--   7 = TRANSFER       (Inter-outlet stock transfer)

-- ============================================================
-- Update transaction_type from ENUM to TINYINT UNSIGNED
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inventory_transactions'
    AND COLUMN_NAME = 'transaction_type'
);

SET @stmt = IF(
  @col_exists > 0,
  'ALTER TABLE inventory_transactions 
   MODIFY COLUMN transaction_type TINYINT UNSIGNED NOT NULL COMMENT ''Transaction type: 1=SALE,2=REFUND,3=RESERVATION,4=RELEASE,5=ADJUSTMENT,6=RECEIPT,7=TRANSFER''',
  'SELECT ''table or column does not exist'''
);

PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add index for transaction type lookups
-- ============================================================
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inventory_transactions'
    AND INDEX_NAME = 'idx_inventory_transactions_type'
);

SET @stmt = IF(
  @idx_exists = 0,
  'ALTER TABLE inventory_transactions ADD INDEX idx_inventory_transactions_type (transaction_type)',
  'SELECT ''skip add idx_inventory_transactions_type'''
);

PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Notes:
-- - TINYINT UNSIGNED: 1 byte, range 0-255, compact and indexable
-- - More extensible than ENUM (add new types without ALTER)
-- - Language-agnostic (no ENUM parsing issues)
-- ============================================================
