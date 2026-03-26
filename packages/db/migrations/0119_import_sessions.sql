-- Migration: 0119_import_sessions.sql
-- Table: import_sessions
-- Purpose: Persistent storage for import upload sessions (replaces in-memory Map)
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Create import_sessions table if it does not already exist
SELECT COUNT(*) INTO @tbl_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'import_sessions';

SET @create_sql = IF(@tbl_exists = 0,
  'CREATE TABLE `import_sessions` (
    `session_id` char(36) NOT NULL,
    `company_id` bigint(20) unsigned NOT NULL,
    `entity_type` varchar(32) NOT NULL,
    `payload` longtext NOT NULL,
    `created_at` datetime NOT NULL DEFAULT current_timestamp(),
    `expires_at` datetime NOT NULL,
    PRIMARY KEY (`session_id`),
    KEY `idx_import_sessions_company` (`company_id`, `session_id`),
    KEY `idx_import_sessions_expires` (`expires_at`),
    CONSTRAINT `chk_import_sessions_payload` CHECK (json_valid(`payload`))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1'
);

PREPARE stmt FROM @create_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
