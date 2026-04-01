-- Migration: 0142_story_20_9_drop_legacy_sync_version_tables.sql
-- Epic 20 closeout: Retire legacy sync version tables
-- Archive and drop sync_data_versions and sync_tier_versions
-- sync_versions is now the canonical store (populated by BumpSyncTiers)
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: safe to rerun (guards archive/drop by source table existence)

-- Ensure canonical target table exists before reconciliation attempts
SET @sync_versions_exists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'sync_versions'
);

-- =============================================================================
-- Step 1: Create archive table for sync_data_versions
-- =============================================================================
CREATE TABLE IF NOT EXISTS `archive_sync_data_versions` (
  `company_id` BIGINT UNSIGNED NOT NULL,
  `current_version` BIGINT UNSIGNED DEFAULT 0,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `archived_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Step 2: Archive sync_data_versions rows before dropping
-- Guard: only archive if source table exists
-- =============================================================================
SET @src_exists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'sync_data_versions'
);
SET @sql = IF(@src_exists = 1,
  'INSERT IGNORE INTO archive_sync_data_versions (company_id, current_version, updated_at) SELECT company_id, current_version, updated_at FROM sync_data_versions',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Step 2b: Reconcile sync_data_versions into canonical sync_versions (tier IS NULL)
-- Guard: only when both source and target tables exist
-- =============================================================================
SET @src_exists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'sync_data_versions'
);

SET @sql = IF(@src_exists = 1 AND @sync_versions_exists = 1,
  'UPDATE sync_versions sv INNER JOIN sync_data_versions sdv ON sv.company_id = sdv.company_id AND sv.tier IS NULL SET sv.current_version = GREATEST(sv.current_version, sdv.current_version), sv.last_synced_at = CASE WHEN sv.last_synced_at IS NULL THEN sdv.updated_at WHEN sdv.updated_at IS NULL THEN sv.last_synced_at ELSE GREATEST(sv.last_synced_at, sdv.updated_at) END, sv.updated_at = CASE WHEN sdv.updated_at IS NULL THEN sv.updated_at ELSE GREATEST(sv.updated_at, sdv.updated_at) END',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@src_exists = 1 AND @sync_versions_exists = 1,
  'INSERT INTO sync_versions (company_id, tier, current_version, min_version, last_synced_at, created_at, updated_at) SELECT sdv.company_id, NULL, sdv.current_version, 0, sdv.updated_at, sdv.updated_at, sdv.updated_at FROM sync_data_versions sdv LEFT JOIN sync_versions sv ON sv.company_id = sdv.company_id AND sv.tier IS NULL WHERE sv.id IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Step 3: Drop sync_data_versions table
-- Guard: only drop if table exists
-- =============================================================================
SET @table_exists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'sync_data_versions'
);
SET @sql = IF(@table_exists > 0,
  'DROP TABLE sync_data_versions',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Step 4: Create archive table for sync_tier_versions
-- =============================================================================
CREATE TABLE IF NOT EXISTS `archive_sync_tier_versions` (
  `company_id` BIGINT UNSIGNED NOT NULL,
  `tier` ENUM('ADMIN','ANALYTICS','MASTER','OPERATIONAL','REALTIME') NOT NULL,
  `current_version` BIGINT UNSIGNED DEFAULT 0,
  `last_updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `archived_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`company_id`, `tier`),
  INDEX `idx_tier` (`tier`),
  INDEX `idx_last_updated_at` (`last_updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Step 5: Archive sync_tier_versions rows before dropping
-- Guard: only archive if source table exists
-- =============================================================================
SET @src_exists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'sync_tier_versions'
);
SET @sql = IF(@src_exists = 1,
  'INSERT IGNORE INTO archive_sync_tier_versions (company_id, tier, current_version, last_updated_at) SELECT company_id, tier, current_version, last_updated_at FROM sync_tier_versions',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Step 5b: Reconcile sync_tier_versions into canonical sync_versions (tier rows)
-- Guard: only when both source and target tables exist
-- =============================================================================
SET @src_exists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'sync_tier_versions'
);

SET @sql = IF(@src_exists = 1 AND @sync_versions_exists = 1,
  'UPDATE sync_versions sv INNER JOIN sync_tier_versions stv ON sv.company_id = stv.company_id AND sv.tier = stv.tier SET sv.current_version = GREATEST(sv.current_version, stv.current_version), sv.last_synced_at = CASE WHEN sv.last_synced_at IS NULL THEN stv.last_updated_at WHEN stv.last_updated_at IS NULL THEN sv.last_synced_at ELSE GREATEST(sv.last_synced_at, stv.last_updated_at) END, sv.updated_at = CASE WHEN stv.last_updated_at IS NULL THEN sv.updated_at ELSE GREATEST(sv.updated_at, stv.last_updated_at) END',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(@src_exists = 1 AND @sync_versions_exists = 1,
  'INSERT INTO sync_versions (company_id, tier, current_version, min_version, last_synced_at, created_at, updated_at) SELECT stv.company_id, stv.tier, stv.current_version, 0, stv.last_updated_at, stv.last_updated_at, stv.last_updated_at FROM sync_tier_versions stv LEFT JOIN sync_versions sv ON sv.company_id = stv.company_id AND sv.tier = stv.tier WHERE sv.id IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Step 6: Drop sync_tier_versions table
-- Guard: only drop if table exists
-- =============================================================================
SET @table_exists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'sync_tier_versions'
);
SET @sql = IF(@table_exists > 0,
  'DROP TABLE sync_tier_versions',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
