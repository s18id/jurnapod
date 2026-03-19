-- Migration: 0102_story_12_1_table_events_append_only_guard.sql
-- Purpose: Enforce append-only behavior on table_events
-- Compatibility: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;

DROP TRIGGER IF EXISTS trg_table_events_scope_bu;
CREATE TRIGGER trg_table_events_scope_bu
BEFORE UPDATE ON table_events
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'table_events is append-only: UPDATE is not allowed';

DROP TRIGGER IF EXISTS trg_table_events_scope_bd;
CREATE TRIGGER trg_table_events_scope_bd
BEFORE DELETE ON table_events
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'table_events is append-only: DELETE is not allowed';

SET FOREIGN_KEY_CHECKS=1;
