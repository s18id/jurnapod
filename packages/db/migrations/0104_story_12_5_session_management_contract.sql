-- Migration: 0104_story_12_5_session_management_contract.sql
-- Purpose: Update CHECK constraints for Story 12.5 Service Session Management
-- Author: BMAD AI Agent
-- Date: 2026-03-19
-- 
-- CRITICAL: This migration is RERUNNABLE and IDEMPOTENT for MySQL 8.0+ and MariaDB 10.2+
-- Updates constraints to support new event types and session status values.
-- 
-- Changes:
--   1. Extend table_events.event_type_id range from 1-8 to 1-13 (new session events)
--   2. Update table_service_sessions.status_id comment (semantics changed: 2=LOCKED_FOR_PAYMENT, 3=CLOSED)

SET FOREIGN_KEY_CHECKS=0;

-- ============================================================================
-- UPDATE 1: Extend table_events event_type_id constraint (1-8 → 1-13)
-- New event types: 9=SESSION_LINE_ADDED, 10=SESSION_LINE_UPDATED, 
--                  11=SESSION_LINE_REMOVED, 12=SESSION_LOCKED, 13=SESSION_CLOSED
-- ============================================================================

SELECT COUNT(*) INTO @table_events_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events';

-- Check if the old constraint exists (range 1-8)
SELECT COUNT(*) INTO @old_chk_events_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events'
  AND CONSTRAINT_NAME = 'chk_table_events_type_range';

-- Drop old constraint if exists (MySQL uses DROP CHECK, MariaDB uses DROP CONSTRAINT)
SELECT VERSION() LIKE '%MariaDB%' INTO @is_mariadb;

SET @drop_old_chk_events = IF(
  @table_events_exists = 1 AND @old_chk_events_exists = 1,
  IF(@is_mariadb = 1,
    'ALTER TABLE table_events DROP CONSTRAINT chk_table_events_type_range',
    'ALTER TABLE table_events DROP CHECK chk_table_events_type_range'),
  'SELECT ''chk_table_events_type_range does not exist or table missing'' AS msg;'
);

PREPARE stmt FROM @drop_old_chk_events;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add new constraint with extended range (1-13)
SELECT COUNT(*) INTO @new_chk_events_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events'
  AND CONSTRAINT_NAME = 'chk_table_events_type_range';

SET @add_new_chk_events = IF(
  @table_events_exists = 1 AND @new_chk_events_exists = 0,
  'ALTER TABLE table_events ADD CONSTRAINT chk_table_events_type_range CHECK (event_type_id BETWEEN 1 AND 13)',
  'SELECT ''chk_table_events_type_range already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_new_chk_events;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Update column comment to document new event types
SELECT COUNT(*) INTO @events_col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events'
  AND COLUMN_NAME = 'event_type_id';

SET @update_events_comment = IF(
  @table_events_exists = 1 AND @events_col_exists = 1,
  "ALTER TABLE table_events MODIFY COLUMN event_type_id INT UNSIGNED NOT NULL COMMENT '1=table_opened, 2=table_closed, 3=reservation_created, 4=reservation_confirmed, 5=reservation_cancelled, 6=status_changed, 7=guest_count_changed, 8=table_transferred, 9=session_line_added, 10=session_line_updated, 11=session_line_removed, 12=session_locked, 13=session_closed'",
  'SELECT ''table_events.event_type_id column missing'' AS msg;'
);

PREPARE stmt FROM @update_events_comment;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- UPDATE 2: Update table_service_sessions status_id constraint comment
-- Status semantics changed per Story 12.5: 1=ACTIVE, 2=LOCKED_FOR_PAYMENT, 3=CLOSED
-- Note: Range stays 1-3, but meanings changed (2 was COMPLETED, now LOCKED_FOR_PAYMENT)
-- ============================================================================

SELECT COUNT(*) INTO @service_sessions_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions';

-- Check if constraint exists
SELECT COUNT(*) INTO @old_chk_sessions_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions'
  AND CONSTRAINT_NAME = 'chk_service_sessions_status_range';

-- Drop old constraint if exists (MySQL uses DROP CHECK, MariaDB uses DROP CONSTRAINT)
SET @drop_old_chk_sessions = IF(
  @service_sessions_exists = 1 AND @old_chk_sessions_exists = 1,
  IF(@is_mariadb = 1,
    'ALTER TABLE table_service_sessions DROP CONSTRAINT chk_service_sessions_status_range',
    'ALTER TABLE table_service_sessions DROP CHECK chk_service_sessions_status_range'),
  'SELECT ''chk_service_sessions_status_range does not exist or table missing'' AS msg;'
);

PREPARE stmt FROM @drop_old_chk_sessions;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add updated constraint (range 1-3, same as before but new semantics)
SELECT COUNT(*) INTO @new_chk_sessions_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions'
  AND CONSTRAINT_NAME = 'chk_service_sessions_status_range';

SET @add_new_chk_sessions = IF(
  @service_sessions_exists = 1 AND @new_chk_sessions_exists = 0,
  'ALTER TABLE table_service_sessions ADD CONSTRAINT chk_service_sessions_status_range CHECK (status_id BETWEEN 1 AND 3)',
  'SELECT ''chk_service_sessions_status_range already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_new_chk_sessions;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Update column comment to document new status semantics
SELECT COUNT(*) INTO @sessions_col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions'
  AND COLUMN_NAME = 'status_id';

SET @update_sessions_comment = IF(
  @service_sessions_exists = 1 AND @sessions_col_exists = 1,
  "ALTER TABLE table_service_sessions MODIFY COLUMN status_id INT UNSIGNED NOT NULL COMMENT '1=ACTIVE, 2=LOCKED_FOR_PAYMENT, 3=CLOSED'",
  'SELECT ''table_service_sessions.status_id column missing'' AS msg;'
);

PREPARE stmt FROM @update_sessions_comment;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify table_events constraint
SET @verify_events_constraint = IF(
  @table_events_exists = 1,
  "SELECT 'table_events' AS table_name, 'chk_table_events_type_range' AS constraint_name, event_type_id AS sample_value FROM table_events WHERE event_type_id > 8 LIMIT 1",
  "SELECT 'table_events' AS table_name, 'chk_table_events_type_range' AS constraint_name, NULL AS sample_value"
);

PREPARE stmt FROM @verify_events_constraint;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verify table_service_sessions constraint
SET @verify_sessions_constraint = IF(
  @service_sessions_exists = 1,
  "SELECT 'table_service_sessions' AS table_name, 'chk_service_sessions_status_range' AS constraint_name, status_id AS sample_value FROM table_service_sessions LIMIT 1",
  "SELECT 'table_service_sessions' AS table_name, 'chk_service_sessions_status_range' AS constraint_name, NULL AS sample_value"
);

PREPARE stmt FROM @verify_sessions_constraint;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
