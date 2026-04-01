-- Migration: 0136_story_20_4_mappings_consolidation.sql
-- Epic: Story 20.4
-- Description: Consolidate four duplicate mapping tables into two unified tables:
--   - account_mappings (replaces company_account_mappings + outlet_account_mappings)
--   - payment_method_mappings (replaces company_payment_method_mappings + outlet_payment_method_mappings)
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci
-- Idempotent: Yes (uses IF NOT EXISTS, INSERT IGNORE, and DROP IF EXISTS patterns)

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- =============================================================================
-- Step 1: Create unified account_mappings table
-- =============================================================================
-- This table consolidates company_account_mappings (NULL outlet_id) and
-- outlet_account_mappings (specific outlet_id)

CREATE TABLE IF NOT EXISTS `account_mappings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NULL COMMENT 'NULL means company-wide mapping',
  `mapping_type_id` bigint(20) unsigned NOT NULL,
  `mapping_key` varchar(64) NOT NULL,
  `account_id` bigint(20) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_company_outlet_type_key` (`company_id`, `outlet_id`, `mapping_type_id`, `mapping_key`),
  INDEX `idx_company_id` (`company_id`),
  INDEX `idx_outlet_id` (`outlet_id`),
  INDEX `idx_account_id` (`account_id`),
  INDEX `idx_mapping_type_id` (`mapping_type_id`),
  CONSTRAINT `fk_am_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_am_account` FOREIGN KEY (`company_id`, `account_id`) REFERENCES `accounts` (`company_id`, `id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Step 2: Create unified payment_method_mappings table
-- =============================================================================
-- This table consolidates company_payment_method_mappings (NULL outlet_id) and
-- outlet_payment_method_mappings (specific outlet_id)

CREATE TABLE IF NOT EXISTS `payment_method_mappings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NULL COMMENT 'NULL means company-wide mapping',
  `method_code` varchar(64) NOT NULL,
  `account_id` bigint(20) unsigned NOT NULL,
  `label` varchar(191) NULL,
  `is_invoice_default` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_company_outlet_method` (`company_id`, `outlet_id`, `method_code`),
  INDEX `idx_company_id` (`company_id`),
  INDEX `idx_outlet_id` (`outlet_id`),
  INDEX `idx_account_id` (`account_id`),
  INDEX `idx_invoice_default` (`company_id`, `is_invoice_default`),
  CONSTRAINT `fk_pmm_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pmm_account` FOREIGN KEY (`company_id`, `account_id`) REFERENCES `accounts` (`company_id`, `id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Step 3: Migrate data from company_account_mappings
-- =============================================================================
-- Company-wide mappings get NULL outlet_id

INSERT IGNORE INTO account_mappings (company_id, outlet_id, mapping_type_id, mapping_key, account_id, created_at, updated_at)
SELECT 
  company_id, 
  NULL AS outlet_id, 
  COALESCE(mapping_type_id, 0) AS mapping_type_id, 
  mapping_key, 
  account_id, 
  created_at, 
  updated_at
FROM company_account_mappings
ON DUPLICATE KEY UPDATE 
  account_id = VALUES(account_id),
  updated_at = VALUES(updated_at);

-- =============================================================================
-- Step 4: Migrate data from outlet_account_mappings
-- =============================================================================
-- Outlet-specific mappings keep their outlet_id

INSERT IGNORE INTO account_mappings (company_id, outlet_id, mapping_type_id, mapping_key, account_id, created_at, updated_at)
SELECT 
  company_id, 
  outlet_id, 
  COALESCE(mapping_type_id, 0) AS mapping_type_id, 
  mapping_key, 
  account_id, 
  created_at, 
  updated_at
FROM outlet_account_mappings
ON DUPLICATE KEY UPDATE 
  account_id = VALUES(account_id),
  updated_at = VALUES(updated_at);

-- =============================================================================
-- Step 5: Migrate data from company_payment_method_mappings
-- =============================================================================
-- Company-wide payment method mappings get NULL outlet_id

INSERT IGNORE INTO payment_method_mappings (company_id, outlet_id, method_code, account_id, label, is_invoice_default, created_at, updated_at)
SELECT 
  company_id, 
  NULL AS outlet_id, 
  method_code, 
  account_id, 
  label, 
  is_invoice_default, 
  created_at, 
  updated_at
FROM company_payment_method_mappings
ON DUPLICATE KEY UPDATE 
  account_id = VALUES(account_id),
  label = VALUES(label),
  is_invoice_default = VALUES(is_invoice_default),
  updated_at = VALUES(updated_at);

-- =============================================================================
-- Step 6: Migrate data from outlet_payment_method_mappings
-- =============================================================================
-- Outlet-specific payment method mappings keep their outlet_id

INSERT IGNORE INTO payment_method_mappings (company_id, outlet_id, method_code, account_id, label, is_invoice_default, created_at, updated_at)
SELECT 
  company_id, 
  outlet_id, 
  method_code, 
  account_id, 
  label, 
  is_invoice_default, 
  created_at, 
  updated_at
FROM outlet_payment_method_mappings
ON DUPLICATE KEY UPDATE 
  account_id = VALUES(account_id),
  label = VALUES(label),
  is_invoice_default = VALUES(is_invoice_default),
  updated_at = VALUES(updated_at);

-- =============================================================================
-- Step 7: Create view aliases for backward compatibility during transition
-- =============================================================================
-- These views allow existing code to work while migration is verified
-- NOTE: Views are created separately after table creation to avoid syntax issues

-- Create company_account_mappings_view (read-only, maps to account_mappings with NULL outlet_id)
CREATE OR REPLACE VIEW company_account_mappings_view AS
SELECT 
  id,
  company_id,
  CAST(NULL AS UNSIGNED) AS outlet_id,
  mapping_type_id,
  mapping_key,
  account_id,
  created_at,
  updated_at
FROM account_mappings
WHERE outlet_id IS NULL;

-- Create outlet_account_mappings_view (read-only, maps to account_mappings with non-NULL outlet_id)
CREATE OR REPLACE VIEW outlet_account_mappings_view AS
SELECT 
  id,
  company_id,
  outlet_id,
  mapping_type_id,
  mapping_key,
  account_id,
  created_at,
  updated_at
FROM account_mappings
WHERE outlet_id IS NOT NULL;

-- Create company_payment_method_mappings_view
CREATE OR REPLACE VIEW company_payment_method_mappings_view AS
SELECT 
  id,
  company_id,
  CAST(NULL AS UNSIGNED) AS outlet_id,
  method_code,
  account_id,
  label,
  is_invoice_default,
  created_at,
  updated_at
FROM payment_method_mappings
WHERE outlet_id IS NULL;

-- Create outlet_payment_method_mappings_view
CREATE OR REPLACE VIEW outlet_payment_method_mappings_view AS
SELECT 
  id,
  company_id,
  outlet_id,
  method_code,
  account_id,
  label,
  is_invoice_default,
  created_at,
  updated_at
FROM payment_method_mappings
WHERE outlet_id IS NOT NULL;

-- =============================================================================
-- NOTE: Old tables should be dropped AFTER full verification
-- Uncomment the following lines after verifying data integrity:
-- =============================================================================
-- DROP TABLE IF EXISTS company_account_mappings;
-- DROP TABLE IF EXISTS outlet_account_mappings;
-- DROP TABLE IF EXISTS company_payment_method_mappings;
-- DROP TABLE IF EXISTS outlet_payment_method_mappings;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
