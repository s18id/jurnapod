-- Migration: 0120_import_session_checkpoint.sql
-- Table: import_sessions
-- Purpose: Add checkpoint columns for import resume capability
-- - checkpoint_data: JSON object storing last successful batch info
-- - file_hash: SHA-256 hash for file integrity verification on resume
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Add checkpoint_data column if it doesn't exist
SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'import_sessions'
  AND COLUMN_NAME = 'checkpoint_data';

SET @alter_checkpoint = IF(@col_exists = 0,
  'ALTER TABLE `import_sessions` ADD COLUMN `checkpoint_data` json DEFAULT NULL AFTER `payload`',
  'SELECT 1'
);

PREPARE stmt_checkpoint FROM @alter_checkpoint;
EXECUTE stmt_checkpoint;
DEALLOCATE PREPARE stmt_checkpoint;

-- Add file_hash column if it doesn't exist
SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'import_sessions'
  AND COLUMN_NAME = 'file_hash';

SET @alter_hash = IF(@col_exists = 0,
  'ALTER TABLE `import_sessions` ADD COLUMN `file_hash` varchar(64) DEFAULT NULL AFTER `checkpoint_data`',
  'SELECT 1'
);

PREPARE stmt_hash FROM @alter_hash;
EXECUTE stmt_hash;
DEALLOCATE PREPARE stmt_hash;

-- Add index for file_hash lookup (for resume validation)
SELECT COUNT(*) INTO @idx_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'import_sessions'
  AND INDEX_NAME = 'idx_import_sessions_file_hash';

SET @add_idx = IF(@idx_exists = 0,
  'ALTER TABLE `import_sessions` ADD INDEX `idx_import_sessions_file_hash` (`company_id`, `file_hash`)',
  'SELECT 1'
);

PREPARE stmt_idx FROM @add_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
