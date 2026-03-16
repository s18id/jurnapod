-- Migration 0114: Add composite indexes for sync tables
-- Replaces single-column indexes with composite indexes for better query performance
-- on backoffice_sync_queue table

-- Drop single-column index on company_id if it exists
SET @idx_company_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'backoffice_sync_queue'
    AND INDEX_NAME = 'idx_backoffice_sync_queue_company'
);

SET @drop_idx_company_sql := IF(
  @idx_company_exists > 0,
  'ALTER TABLE backoffice_sync_queue DROP INDEX idx_backoffice_sync_queue_company',
  'SELECT 1'
);

PREPARE stmt FROM @drop_idx_company_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Drop single-column index on sync_status if it exists
SET @idx_status_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'backoffice_sync_queue'
    AND INDEX_NAME = 'idx_backoffice_sync_queue_status'
);

SET @drop_idx_status_sql := IF(
  @idx_status_exists > 0,
  'ALTER TABLE backoffice_sync_queue DROP INDEX idx_backoffice_sync_queue_status',
  'SELECT 1'
);

PREPARE stmt FROM @drop_idx_status_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Drop single-column index on tier if it exists
SET @idx_tier_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'backoffice_sync_queue'
    AND INDEX_NAME = 'idx_backoffice_sync_queue_tier'
);

SET @drop_idx_tier_sql := IF(
  @idx_tier_exists > 0,
  'ALTER TABLE backoffice_sync_queue DROP INDEX idx_backoffice_sync_queue_tier',
  'SELECT 1'
);

PREPARE stmt FROM @drop_idx_tier_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create composite index on (company_id, sync_status)
SET @idx_company_status_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'backoffice_sync_queue'
    AND INDEX_NAME = 'idx_backoffice_sync_queue_company_status'
);

SET @add_idx_company_status_sql := IF(
  @idx_company_status_exists = 0,
  'ALTER TABLE backoffice_sync_queue ADD INDEX idx_backoffice_sync_queue_company_status (company_id, sync_status)',
  'SELECT 1'
);

PREPARE stmt FROM @add_idx_company_status_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create composite index on (tier, sync_status)
SET @idx_tier_status_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'backoffice_sync_queue'
    AND INDEX_NAME = 'idx_backoffice_sync_queue_tier_status'
);

SET @add_idx_tier_status_sql := IF(
  @idx_tier_status_exists = 0,
  'ALTER TABLE backoffice_sync_queue ADD INDEX idx_backoffice_sync_queue_tier_status (tier, sync_status)',
  'SELECT 1'
);

PREPARE stmt FROM @add_idx_tier_status_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
