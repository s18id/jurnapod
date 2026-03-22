-- Migration: 0109_story_12_6_conflict_audit_columns.sql
-- Purpose: Add conflict audit columns to table_events for AC4 traceability
-- Author: BMAD AI Agent
-- Date: 2026-03-19
-- Story: 12.6 Scope C - Conflict audit/event traceability
-- 
-- CRITICAL: This migration is RERUNNABLE and IDEMPOTENT for MySQL 8.0+ and MariaDB 10.2+
-- Run it multiple times safely - it checks existence before altering.

SET FOREIGN_KEY_CHECKS=0;

-- ============================================================================
-- STEP 1: Add is_conflict column
-- ============================================================================
SELECT COUNT(*) INTO @column_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events'
  AND COLUMN_NAME = 'is_conflict';

SET @add_is_conflict = IF(@column_exists = 0,
  'ALTER TABLE table_events 
   ADD COLUMN is_conflict TINYINT UNSIGNED NOT NULL DEFAULT 0 
   COMMENT ''Flag indicating this event was a conflict attempt (not applied)''
   AFTER created_by',
  'SELECT ''Column is_conflict already exists'' AS msg;'
);

PREPARE stmt FROM @add_is_conflict;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- STEP 2: Add conflict_reason column
-- ============================================================================
SELECT COUNT(*) INTO @column_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events'
  AND COLUMN_NAME = 'conflict_reason';

SET @add_conflict_reason = IF(@column_exists = 0,
  'ALTER TABLE table_events 
   ADD COLUMN conflict_reason VARCHAR(500) NULL 
   COMMENT ''Human-readable description of why conflict occurred (e.g., version mismatch details)''
   AFTER is_conflict',
  'SELECT ''Column conflict_reason already exists'' AS msg;'
);

PREPARE stmt FROM @add_conflict_reason;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- STEP 3: Add index for conflict event queries
-- ============================================================================
SELECT COUNT(*) INTO @index_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events'
  AND INDEX_NAME = 'idx_table_events_conflict';

SET @add_conflict_index = IF(@index_exists = 0,
  'ALTER TABLE table_events ADD KEY idx_table_events_conflict (is_conflict, occurred_at)',
  'SELECT ''Index idx_table_events_conflict already exists'' AS msg;'
);

PREPARE stmt FROM @add_conflict_index;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 
  'table_events' AS table_name,
  SUM(CASE WHEN COLUMN_NAME = 'is_conflict' THEN 1 ELSE 0 END) AS has_is_conflict,
  SUM(CASE WHEN COLUMN_NAME = 'conflict_reason' THEN 1 ELSE 0 END) AS has_conflict_reason
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events';

SET FOREIGN_KEY_CHECKS=1;