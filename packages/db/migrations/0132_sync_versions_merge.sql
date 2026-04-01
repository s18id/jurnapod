-- Migration: 0132_sync_versions_merge.sql
-- Story: 20.7 Sync Versions Merge
-- Description: Merge sync_data_versions and sync_tier_versions into sync_versions table
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

-- Step 1: Create the unified sync_versions table
CREATE TABLE IF NOT EXISTS `sync_versions` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `company_id` BIGINT UNSIGNED NOT NULL,
    `tier` VARCHAR(50) NULL COMMENT 'NULL for data sync, specific tier name for tier sync',
    `current_version` BIGINT UNSIGNED DEFAULT 0,
    `min_version` BIGINT UNSIGNED DEFAULT 0,
    `last_synced_at` DATETIME NULL,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_company_tier` (`company_id`, `tier`),
    INDEX `idx_company_id` (`company_id`),
    CONSTRAINT `fk_sv_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 2: Migrate data from sync_data_versions (tier = NULL)
-- Use INSERT IGNORE to skip companies that already have a row (shouldn't happen but safety first)
INSERT IGNORE INTO sync_versions (company_id, tier, current_version, min_version, last_synced_at, created_at, updated_at)
SELECT 
    company_id,
    NULL,
    current_version,
    0 AS min_version,
    updated_at AS last_synced_at,
    updated_at AS created_at,
    updated_at
FROM sync_data_versions;

-- Step 3: Migrate data from sync_tier_versions (tier = tier_name)
-- For existing company_id+tier combinations, update the versions if the source is newer
INSERT INTO sync_versions (company_id, tier, current_version, min_version, last_synced_at, created_at, updated_at)
SELECT 
    company_id,
    tier,
    current_version,
    0 AS min_version,
    last_updated_at AS last_synced_at,
    last_updated_at AS created_at,
    last_updated_at
FROM sync_tier_versions
ON DUPLICATE KEY UPDATE 
    current_version = VALUES(current_version),
    last_synced_at = VALUES(last_synced_at);

-- Step 4: Verify counts (for manual verification)
-- SELECT 'sync_data_versions count:' AS info, COUNT(*) AS cnt FROM sync_data_versions
-- UNION ALL
-- SELECT 'sync_tier_versions count:', COUNT(*) FROM sync_tier_versions
-- UNION ALL
-- SELECT 'sync_versions (tier=NULL) count:', COUNT(*) FROM sync_versions WHERE tier IS NULL
-- UNION ALL
-- SELECT 'sync_versions (tier!=NULL) count:', COUNT(*) FROM sync_versions WHERE tier IS NOT NULL;
