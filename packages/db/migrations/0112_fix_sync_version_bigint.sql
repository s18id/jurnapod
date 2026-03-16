-- Migration 0112: Fix Sync Version Columns to BIGINT UNSIGNED
-- Changes sync_tier_versions.current_version and pos_sync_metadata.last_version
-- from INT UNSIGNED to BIGINT UNSIGNED for consistency and future-proofing
-- 
-- Requirements:
-- - Rerunnable/idempotent (checks if column needs altering first)
-- - Compatible with both MySQL 8.0+ and MariaDB

-- ============================================================================
-- sync_tier_versions.current_version: INT UNSIGNED -> BIGINT UNSIGNED
-- ============================================================================

SET @db_name = DATABASE();

-- Check if sync_tier_versions.current_version needs to be altered
SET @needs_alter_sync_tier = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'sync_tier_versions' 
    AND COLUMN_NAME = 'current_version'
    AND (DATA_TYPE != 'bigint' OR COLUMN_TYPE != 'bigint(20) unsigned')
);

SET @alter_sync_tier_sql = IF(@needs_alter_sync_tier > 0,
    'ALTER TABLE sync_tier_versions MODIFY COLUMN current_version BIGINT UNSIGNED NOT NULL DEFAULT 0',
    'SELECT "sync_tier_versions.current_version already BIGINT UNSIGNED, skipping" AS message'
);

PREPARE stmt_sync_tier FROM @alter_sync_tier_sql;
EXECUTE stmt_sync_tier;
DEALLOCATE PREPARE stmt_sync_tier;

-- ============================================================================
-- pos_sync_metadata.last_version: INT UNSIGNED -> BIGINT UNSIGNED
-- ============================================================================

-- Check if pos_sync_metadata.last_version needs to be altered
SET @needs_alter_pos_meta = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'pos_sync_metadata' 
    AND COLUMN_NAME = 'last_version'
    AND (DATA_TYPE != 'bigint' OR COLUMN_TYPE NOT LIKE 'bigint%unsigned')
);

SET @alter_pos_meta_sql = IF(@needs_alter_pos_meta > 0,
    'ALTER TABLE pos_sync_metadata MODIFY COLUMN last_version BIGINT UNSIGNED NULL',
    'SELECT "pos_sync_metadata.last_version already BIGINT UNSIGNED, skipping" AS message'
);

PREPARE stmt_pos_meta FROM @alter_pos_meta_sql;
EXECUTE stmt_pos_meta;
DEALLOCATE PREPARE stmt_pos_meta;

-- ============================================================================
-- Update sync_operations columns for consistency
-- ============================================================================

-- Check if sync_operations.data_version_before needs to be altered
SET @needs_alter_op_before = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'sync_operations' 
    AND COLUMN_NAME = 'data_version_before'
    AND (DATA_TYPE != 'bigint' OR COLUMN_TYPE NOT LIKE 'bigint%unsigned')
);

SET @alter_op_before_sql = IF(@needs_alter_op_before > 0,
    'ALTER TABLE sync_operations MODIFY COLUMN data_version_before BIGINT UNSIGNED NULL',
    'SELECT "sync_operations.data_version_before already BIGINT UNSIGNED, skipping" AS message'
);

PREPARE stmt_op_before FROM @alter_op_before_sql;
EXECUTE stmt_op_before;
DEALLOCATE PREPARE stmt_op_before;

-- Check if sync_operations.data_version_after needs to be altered
SET @needs_alter_op_after = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'sync_operations' 
    AND COLUMN_NAME = 'data_version_after'
    AND (DATA_TYPE != 'bigint' OR COLUMN_TYPE NOT LIKE 'bigint%unsigned')
);

SET @alter_op_after_sql = IF(@needs_alter_op_after > 0,
    'ALTER TABLE sync_operations MODIFY COLUMN data_version_after BIGINT UNSIGNED NULL',
    'SELECT "sync_operations.data_version_after already BIGINT UNSIGNED, skipping" AS message'
);

PREPARE stmt_op_after FROM @alter_op_after_sql;
EXECUTE stmt_op_after;
DEALLOCATE PREPARE stmt_op_after;
