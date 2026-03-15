-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Add discount columns to pos_transactions
-- Purpose: Store transaction-level discounts for journal posting
-- Portable across MySQL 8.0+ and MariaDB

-- Add discount_percent column if not exists
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND COLUMN_NAME = 'discount_percent'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE pos_transactions ADD COLUMN discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0',
  'SELECT ''skip discount_percent'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add discount_fixed column if not exists
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND COLUMN_NAME = 'discount_fixed'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE pos_transactions ADD COLUMN discount_fixed DECIMAL(18,2) NOT NULL DEFAULT 0',
  'SELECT ''skip discount_fixed'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add discount_code column if not exists
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND COLUMN_NAME = 'discount_code'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE pos_transactions ADD COLUMN discount_code VARCHAR(50) NULL DEFAULT NULL',
  'SELECT ''skip discount_code'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for discount queries if not exists
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND INDEX_NAME = 'idx_pos_transactions_discounts'
);

SET @stmt = IF(
  @idx_exists = 0,
  'ALTER TABLE pos_transactions ADD INDEX idx_pos_transactions_discounts (company_id, trx_at)',
  'SELECT ''skip idx_pos_transactions_discounts'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
