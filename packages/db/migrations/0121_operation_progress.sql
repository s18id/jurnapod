-- Migration: 0121_operation_progress.sql
-- Table: operation_progress
-- Purpose: Persistent progress tracking for long-running operations
-- - Tracks import, export, and batch_update operations
-- - Supports real-time progress updates via SSE
-- - Company-scoped isolation
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Create operation_progress table if it doesn't exist
SELECT COUNT(*) INTO @table_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'operation_progress';

SET @create_table = IF(@table_exists = 0,
  'CREATE TABLE `operation_progress` (
    `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
    `operation_id` varchar(64) NOT NULL,
    `operation_type` varchar(32) NOT NULL,
    `company_id` bigint(20) unsigned NOT NULL,
    `total_units` int(11) NOT NULL DEFAULT 0,
    `completed_units` int(11) NOT NULL DEFAULT 0,
    `status` varchar(16) NOT NULL DEFAULT ''running'',
    `started_at` datetime NOT NULL,
    `updated_at` datetime NOT NULL,
    `completed_at` datetime DEFAULT NULL,
    `details` json DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_operation_progress_operation_id` (`operation_id`),
    INDEX `idx_operation_progress_company` (`company_id`, `operation_id`),
    INDEX `idx_operation_progress_status_updated` (`status`, `updated_at`),
    INDEX `idx_operation_progress_type` (`company_id`, `operation_type`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1'
);

PREPARE stmt FROM @create_table;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
