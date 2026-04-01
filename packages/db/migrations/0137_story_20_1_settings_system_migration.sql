-- Migration: 0137_story_20_1_settings_system_migration.sql
-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)
--
-- Story 20.1: Settings System Migration
-- Migration: Create new normalized settings tables and migrate data from legacy tables
-- Risk: HIGH - Settings touch all modules
--
-- This migration is IDEMPOTENT - safe to run multiple times
-- Migration order: Create new tables -> Migrate data -> Verify counts -> Code updates
-- Rerun safety: guards source table access by existence checks

-- =============================================================================
-- STEP 1: Create new settings_strings table
-- =============================================================================

SET @table_exists = (
  SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = DATABASE() 
    AND table_name = 'settings_strings'
);
SET @sql = IF(@table_exists = 0, 
  'CREATE TABLE settings_strings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NULL,
    setting_key VARCHAR(255) NOT NULL,
    setting_value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_company_outlet_key (company_id, outlet_id, setting_key),
    INDEX idx_company_id (company_id),
    INDEX idx_outlet_id (outlet_id),
    CONSTRAINT fk_settings_strings_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- STEP 2: Create new settings_numbers table
-- =============================================================================

SET @table_exists = (
  SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = DATABASE() 
    AND table_name = 'settings_numbers'
);
SET @sql = IF(@table_exists = 0, 
  'CREATE TABLE settings_numbers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NULL,
    setting_key VARCHAR(255) NOT NULL,
    setting_value DECIMAL(20, 6) NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_company_outlet_key (company_id, outlet_id, setting_key),
    INDEX idx_company_id (company_id),
    INDEX idx_outlet_id (outlet_id),
    CONSTRAINT fk_settings_numbers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- STEP 3: Create new settings_booleans table
-- =============================================================================

SET @table_exists = (
  SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = DATABASE() 
    AND table_name = 'settings_booleans'
);
SET @sql = IF(@table_exists = 0, 
  'CREATE TABLE settings_booleans (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NULL,
    setting_key VARCHAR(255) NOT NULL,
    setting_value TINYINT(1) DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_company_outlet_key (company_id, outlet_id, setting_key),
    INDEX idx_company_id (company_id),
    INDEX idx_outlet_id (outlet_id),
    CONSTRAINT fk_settings_booleans_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- STEP 4: Migrate data from company_settings to settings_strings
-- Guard: only migrate if source table exists (idempotent on rerun after drop)
-- Note: company_settings rows must have non-NULL company_id to satisfy FK constraint
-- =============================================================================

SET @src_exists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'company_settings'
);
SET @sql = IF(@src_exists = 1,
  'INSERT INTO settings_strings (company_id, outlet_id, setting_key, setting_value, created_at, updated_at) SELECT company_id, outlet_id, `key`, value_json, created_at, updated_at FROM company_settings WHERE value_type = ''string'' AND company_id IS NOT NULL ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@src_exists = 1,
  'INSERT INTO settings_numbers (company_id, outlet_id, setting_key, setting_value, created_at, updated_at) SELECT company_id, outlet_id, `key`, CAST(value_json AS DECIMAL(20, 6)), created_at, updated_at FROM company_settings WHERE value_type = ''number'' AND company_id IS NOT NULL ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@src_exists = 1,
  'INSERT INTO settings_booleans (company_id, outlet_id, setting_key, setting_value, created_at, updated_at) SELECT company_id, outlet_id, `key`, CASE WHEN JSON_EXTRACT(value_json, ''$'') = true THEN 1 WHEN JSON_EXTRACT(value_json, ''$'') = false THEN 0 ELSE NULL END, created_at, updated_at FROM company_settings WHERE value_type = ''boolean'' AND company_id IS NOT NULL ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- STEP 5: Platform settings migration is intentionally deferred
-- platform_settings rows are global (no company_id), while settings_* tables are company-scoped.
-- To avoid invalid NULL company_id writes and duplicate NULL-key semantics on reruns,
-- we skip automatic migration here.
-- A later dedicated migration must define canonical platform scope behavior.
-- =============================================================================

SELECT 1;

-- =============================================================================
-- STEP 6: Verification queries (run manually to verify)
-- =============================================================================

-- SELECT 'settings_strings count' as metric, COUNT(*) as cnt FROM settings_strings;
-- SELECT 'settings_numbers count' as metric, COUNT(*) as cnt FROM settings_numbers;
-- SELECT 'settings_booleans count' as metric, COUNT(*) as cnt FROM settings_booleans;
-- SELECT 'company_settings string count' as metric, COUNT(*) as cnt FROM company_settings WHERE value_type = 'string';
-- SELECT 'company_settings number count' as metric, COUNT(*) as cnt FROM company_settings WHERE value_type = 'number';
-- SELECT 'company_settings boolean count' as metric, COUNT(*) as cnt FROM company_settings WHERE value_type = 'boolean';
-- SELECT 'platform_settings count' as metric, COUNT(*) as cnt FROM platform_settings;

-- =============================================================================
-- SAFETY: Old tables are NOT dropped
-- Old tables must remain until full verification and 48h monitoring period
-- Uncomment ONLY after full verification:
-- -- DROP TABLE IF EXISTS company_settings;
-- -- DROP TABLE IF EXISTS platform_settings;
-- =============================================================================
