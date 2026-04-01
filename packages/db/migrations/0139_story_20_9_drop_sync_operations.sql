-- Migration: 0139_story_20_9_drop_sync_operations.sql
-- Epic 20 closeout: Retire legacy sync_operations table
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: safe to rerun (guards archive/drop by source table existence)

-- This table was used for tracking sync operations but is no longer needed
-- as sync operations are tracked via sync_audit_events and tier versioning.
-- Runtime dependency has been removed from data-retention.job.ts.

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- =============================================================================
-- Step 1: Create archive table for sync_operations data retention
-- Archive table captures legacy structure for audit/history purposes
-- =============================================================================
CREATE TABLE IF NOT EXISTS `archive_sync_operations` (
  `id` BIGINT UNSIGNED NOT NULL,
  `company_id` BIGINT UNSIGNED NOT NULL,
  `outlet_id` BIGINT UNSIGNED NULL,
  `sync_module` ENUM('POS','BACKOFFICE') NOT NULL,
  `tier` ENUM('REALTIME','OPERATIONAL','MASTER','ADMIN','ANALYTICS') NOT NULL,
  `operation_type` ENUM('PUSH','PULL','RECONCILE','BATCH') NOT NULL,
  `request_id` VARCHAR(36) NOT NULL,
  `started_at` DATETIME NOT NULL,
  `completed_at` DATETIME NULL,
  `status` ENUM('RUNNING','SUCCESS','FAILED','CANCELLED') NOT NULL,
  `records_processed` INT UNSIGNED NULL,
  `data_version_before` BIGINT UNSIGNED NULL,
  `data_version_after` BIGINT UNSIGNED NULL,
  `error_message` TEXT NULL,
  `result_summary` LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `duration_ms` INT UNSIGNED NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `archived_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_company_id` (`company_id`),
  INDEX `idx_outlet_id` (`outlet_id`),
  INDEX `idx_sync_module_tier` (`sync_module`,`tier`),
  INDEX `idx_operation_type` (`operation_type`),
  INDEX `idx_request_id` (`request_id`),
  INDEX `idx_started_at` (`started_at`),
  INDEX `idx_completed_at` (`completed_at`),
  INDEX `idx_status` (`status`),
  INDEX `idx_duration_ms` (`duration_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- Step 2: Archive existing rows before dropping (data retention)
-- Guard: only archive if source table exists and has rows
-- =============================================================================
SET @src_exists = (
  SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = DATABASE() 
    AND table_name = 'sync_operations'
);
SET @sql = IF(@src_exists = 1,
  'INSERT IGNORE INTO archive_sync_operations (id, company_id, outlet_id, sync_module, tier, operation_type, request_id, started_at, completed_at, status, records_processed, data_version_before, data_version_after, error_message, result_summary, duration_ms, created_at) SELECT id, company_id, outlet_id, sync_module, tier, operation_type, request_id, started_at, completed_at, status, records_processed, data_version_before, data_version_after, error_message, result_summary, duration_ms, started_at FROM sync_operations',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Step 3: Drop legacy sync_operations table
-- Guard: only drop if table exists
-- =============================================================================
SET @table_exists = (
  SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = DATABASE() 
    AND table_name = 'sync_operations'
);
SET @sql = IF(@table_exists > 0, 
  'DROP TABLE sync_operations',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
