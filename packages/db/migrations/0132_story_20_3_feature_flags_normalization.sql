-- Migration: 0132_story_20_3_feature_flags_normalization.sql
-- Story: Epic 20, Story 20.3 - Feature Flags Normalization
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Description: Add explicit typed columns for rollout percentage, target segments, and date range to feature_flags table

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Add rollout_percentage column
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'feature_flags' 
    AND column_name = 'rollout_percentage'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE feature_flags ADD COLUMN rollout_percentage INT NOT NULL DEFAULT 100',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add CHECK constraint for rollout_percentage (MySQL 8.0+)
SET @constraint_exists = (
  SELECT COUNT(*) FROM information_schema.check_constraints 
  WHERE constraint_schema = DATABASE() 
    AND constraint_name = 'chk_feature_flags_rollout_percentage'
);
SET @sql = IF(@constraint_exists = 0,
  'ALTER TABLE feature_flags ADD CONSTRAINT chk_feature_flags_rollout_percentage CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add target_segments column
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'feature_flags' 
    AND column_name = 'target_segments'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE feature_flags ADD COLUMN target_segments JSON NULL COMMENT ''Array of segment IDs for targeted rollout''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add start_at column
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'feature_flags' 
    AND column_name = 'start_at'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE feature_flags ADD COLUMN start_at DATETIME NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add end_at column
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'feature_flags' 
    AND column_name = 'end_at'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE feature_flags ADD COLUMN end_at DATETIME NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for efficient active/date queries
SET @index_exists = (
  SELECT COUNT(*) FROM information_schema.statistics 
  WHERE table_schema = DATABASE() 
    AND table_name = 'feature_flags' 
    AND index_name = 'idx_feature_flags_active'
);
SET @sql = IF(@index_exists = 0,
  'CREATE INDEX idx_feature_flags_active ON feature_flags (enabled, start_at, end_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Migration: Populate new columns from config_json
-- Only update rows where config_json IS NOT NULL and the new columns haven't been populated yet
UPDATE feature_flags SET
    rollout_percentage = COALESCE(JSON_EXTRACT(config_json, '$.rollout_percentage'), 100),
    target_segments = JSON_EXTRACT(config_json, '$.target_segments'),
    start_at = JSON_UNQUOTE(JSON_EXTRACT(config_json, '$.start_at')),
    end_at = JSON_UNQUOTE(JSON_EXTRACT(config_json, '$.end_at'))
WHERE config_json IS NOT NULL 
  AND (rollout_percentage = 100 OR rollout_percentage IS NULL);

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
