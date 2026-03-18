-- Migration: 0090_item_variants_archive.sql
-- Description: Add archived_at column to item_variants for soft deletion of old combinations
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;

-- Add archived_at column to item_variants if it doesn't exist
SELECT COUNT(*) INTO @column_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'item_variants'
  AND COLUMN_NAME = 'archived_at';

SET @add_column = IF(@column_exists = 0,
  'ALTER TABLE item_variants ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL AFTER is_active',
  'SELECT 1');

PREPARE stmt FROM @add_column;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for archived_at column for efficient filtering
SELECT COUNT(*) INTO @index_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'item_variants'
  AND INDEX_NAME = 'idx_archived_at';

SET @add_index = IF(@index_exists = 0,
  'ALTER TABLE item_variants ADD INDEX idx_archived_at (archived_at)',
  'SELECT 1');

PREPARE stmt FROM @add_index;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
