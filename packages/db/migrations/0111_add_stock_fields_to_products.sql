-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Add stock tracking fields to items table
-- Purpose: Enable per-item stock tracking configuration
-- Portable across MySQL 8.0+ and MariaDB

-- ============================================================
-- Add track_stock column
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'items'
    AND COLUMN_NAME = 'track_stock'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE items ADD COLUMN track_stock TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active',
  'SELECT ''skip add track_stock'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add low_stock_threshold column
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'items'
    AND COLUMN_NAME = 'low_stock_threshold'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE items ADD COLUMN low_stock_threshold DECIMAL(15,4) DEFAULT NULL AFTER track_stock',
  'SELECT ''skip add low_stock_threshold'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add index for items that track stock
-- ============================================================
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'items'
    AND INDEX_NAME = 'idx_items_track_stock'
);

SET @stmt = IF(
  @idx_exists = 0,
  'ALTER TABLE items ADD INDEX idx_items_track_stock (company_id, track_stock)',
  'SELECT ''skip add idx_items_track_stock'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add index for low stock threshold queries
-- ============================================================
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'items'
    AND INDEX_NAME = 'idx_items_low_stock_threshold'
);

SET @stmt = IF(
  @idx_exists = 0,
  'ALTER TABLE items ADD INDEX idx_items_low_stock_threshold (company_id, low_stock_threshold)',
  'SELECT ''skip add idx_items_low_stock_threshold'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
