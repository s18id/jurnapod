-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Add profile fields to outlets table for multi-location support
-- Portable across MySQL 8.0+ and MariaDB

-- ============================================================
-- Add city column
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlets'
    AND COLUMN_NAME = 'city'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE outlets ADD COLUMN city VARCHAR(96) NULL AFTER name',
  'SELECT ''skip add city'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add address_line1 column
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlets'
    AND COLUMN_NAME = 'address_line1'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE outlets ADD COLUMN address_line1 VARCHAR(191) NULL AFTER city',
  'SELECT ''skip add address_line1'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add address_line2 column
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlets'
    AND COLUMN_NAME = 'address_line2'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE outlets ADD COLUMN address_line2 VARCHAR(191) NULL AFTER address_line1',
  'SELECT ''skip add address_line2'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add postal_code column
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlets'
    AND COLUMN_NAME = 'postal_code'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE outlets ADD COLUMN postal_code VARCHAR(20) NULL AFTER address_line2',
  'SELECT ''skip add postal_code'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add phone column
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlets'
    AND COLUMN_NAME = 'phone'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE outlets ADD COLUMN phone VARCHAR(32) NULL AFTER postal_code',
  'SELECT ''skip add phone'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add email column
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlets'
    AND COLUMN_NAME = 'email'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE outlets ADD COLUMN email VARCHAR(191) NULL AFTER phone',
  'SELECT ''skip add email'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add timezone column
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlets'
    AND COLUMN_NAME = 'timezone'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE outlets ADD COLUMN timezone VARCHAR(64) NULL AFTER email',
  'SELECT ''skip add timezone'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add is_active column
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlets'
    AND COLUMN_NAME = 'is_active'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE outlets ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER timezone',
  'SELECT ''skip add is_active'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add indexes for common query patterns
-- ============================================================
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlets'
    AND INDEX_NAME = 'idx_outlets_company_is_active'
    AND SEQ_IN_INDEX = 1
    AND COLUMN_NAME = 'company_id'
);

SET @stmt = IF(
  @idx_exists = 0,
  'ALTER TABLE outlets ADD KEY idx_outlets_company_is_active (company_id, is_active)',
  'SELECT ''skip add idx_outlets_company_is_active'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlets'
    AND INDEX_NAME = 'idx_outlets_company_city'
    AND SEQ_IN_INDEX = 1
    AND COLUMN_NAME = 'company_id'
);

SET @stmt = IF(
  @idx_exists = 0,
  'ALTER TABLE outlets ADD KEY idx_outlets_company_city (company_id, city)',
  'SELECT ''skip add idx_outlets_company_city'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
