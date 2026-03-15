-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Add profile fields to companies table for legal, tax, and contact information
-- Portable across MySQL 8.0+ and MariaDB

-- ============================================================
-- Add legal_name column
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'legal_name'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE companies ADD COLUMN legal_name VARCHAR(191) NULL AFTER name',
  'SELECT ''skip add legal_name'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add tax_id column (NPWP in Indonesia)
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'tax_id'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE companies ADD COLUMN tax_id VARCHAR(64) NULL AFTER legal_name',
  'SELECT ''skip add tax_id'''
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
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'email'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE companies ADD COLUMN email VARCHAR(191) NULL AFTER tax_id',
  'SELECT ''skip add email'''
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
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'phone'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE companies ADD COLUMN phone VARCHAR(32) NULL AFTER email',
  'SELECT ''skip add phone'''
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
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'address_line1'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE companies ADD COLUMN address_line1 VARCHAR(191) NULL AFTER phone',
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
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'address_line2'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE companies ADD COLUMN address_line2 VARCHAR(191) NULL AFTER address_line1',
  'SELECT ''skip add address_line2'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add city column
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'city'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE companies ADD COLUMN city VARCHAR(96) NULL AFTER address_line2',
  'SELECT ''skip add city'''
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
    AND TABLE_NAME = 'companies'
    AND COLUMN_NAME = 'postal_code'
);

SET @stmt = IF(
  @col_exists = 0,
  'ALTER TABLE companies ADD COLUMN postal_code VARCHAR(20) NULL AFTER city',
  'SELECT ''skip add postal_code'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- Add index for company search by city
-- ============================================================
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'companies'
    AND INDEX_NAME = 'idx_companies_city'
    AND SEQ_IN_INDEX = 1
    AND COLUMN_NAME = 'city'
);

SET @stmt = IF(
  @idx_exists = 0,
  'ALTER TABLE companies ADD KEY idx_companies_city (city)',
  'SELECT ''skip add idx_companies_city'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
