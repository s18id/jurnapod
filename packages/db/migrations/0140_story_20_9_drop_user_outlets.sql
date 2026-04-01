-- Migration: 0140_story_20_9_drop_user_outlets.sql
-- Epic 20 closeout: Retire legacy user_outlets table
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: safe to rerun (guards archive/drop by source table existence)

-- This table was replaced by user_role_assignments which provides
-- the same user-to-outlet mapping with additional role context.
-- No runtime dependencies remain after test updates.

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- =============================================================================
-- Step 1: Create archive table for user_outlets data retention
-- Archive table captures legacy structure for audit/history purposes
-- Note: This is a legacy join table; user_role_assignments now provides
-- the same user-to-outlet mapping with additional role context
-- =============================================================================
CREATE TABLE IF NOT EXISTS `archive_user_outlets` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `outlet_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `archived_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `outlet_id`),
  INDEX `idx_outlet_id` (`outlet_id`),
  INDEX `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Step 2: Archive existing rows before dropping (data retention)
-- Guard: only archive if source table exists and has rows
-- =============================================================================
SET @src_exists = (
  SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = DATABASE() 
    AND table_name = 'user_outlets'
);
SET @sql = IF(@src_exists = 1,
  'INSERT IGNORE INTO archive_user_outlets (user_id, outlet_id, created_at) SELECT user_id, outlet_id, created_at FROM user_outlets',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Step 3: Drop legacy user_outlets table
-- Guard: only drop if table exists
-- =============================================================================
SET @table_exists = (
  SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = DATABASE() 
    AND table_name = 'user_outlets'
);
SET @sql = IF(@table_exists > 0, 
  'DROP TABLE user_outlets',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
