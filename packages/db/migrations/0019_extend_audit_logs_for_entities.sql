-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Extend audit_logs table to support entity-specific tracking
-- This adds columns to track what entity was affected and what changed

SET @audit_logs_entity_type_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'audit_logs'
    AND COLUMN_NAME = 'entity_type'
);

SET @audit_logs_entity_id_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'audit_logs'
    AND COLUMN_NAME = 'entity_id'
);

SET @audit_logs_changes_json_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'audit_logs'
    AND COLUMN_NAME = 'changes_json'
);

SET @add_audit_logs_entity_type_sql := IF(
  @audit_logs_entity_type_exists = 0,
  'ALTER TABLE audit_logs ADD COLUMN entity_type VARCHAR(64) DEFAULT NULL AFTER user_id',
  'SELECT 1'
);

PREPARE stmt FROM @add_audit_logs_entity_type_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_audit_logs_entity_id_sql := IF(
  @audit_logs_entity_id_exists = 0,
  'ALTER TABLE audit_logs ADD COLUMN entity_id VARCHAR(128) DEFAULT NULL AFTER entity_type',
  'SELECT 1'
);

PREPARE stmt FROM @add_audit_logs_entity_id_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_audit_logs_changes_json_sql := IF(
  @audit_logs_changes_json_exists = 0,
  'ALTER TABLE audit_logs ADD COLUMN changes_json LONGTEXT DEFAULT NULL AFTER payload_json',
  'SELECT 1'
);

PREPARE stmt FROM @add_audit_logs_changes_json_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @audit_logs_changes_check_exists := (
  SELECT COUNT(*)
  FROM information_schema.CHECK_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND CONSTRAINT_NAME = 'chk_audit_logs_changes_json'
);

SET @add_audit_logs_changes_check_sql := IF(
  @audit_logs_changes_check_exists = 0,
  'ALTER TABLE audit_logs ADD CONSTRAINT chk_audit_logs_changes_json CHECK (changes_json IS NULL OR JSON_VALID(changes_json))',
  'SELECT 1'
);

PREPARE stmt FROM @add_audit_logs_changes_check_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @audit_logs_entity_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'audit_logs'
    AND INDEX_NAME = 'idx_audit_logs_entity'
);

SET @add_audit_logs_entity_index_sql := IF(
  @audit_logs_entity_index_exists = 0,
  'CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at)',
  'SELECT 1'
);

PREPARE stmt FROM @add_audit_logs_entity_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @audit_logs_company_entity_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'audit_logs'
    AND INDEX_NAME = 'idx_audit_logs_company_entity'
);

SET @add_audit_logs_company_entity_index_sql := IF(
  @audit_logs_company_entity_index_exists = 0,
  'CREATE INDEX idx_audit_logs_company_entity ON audit_logs(company_id, entity_type, created_at)',
  'SELECT 1'
);

PREPARE stmt FROM @add_audit_logs_company_entity_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Comments for documentation
ALTER TABLE audit_logs MODIFY COLUMN action VARCHAR(64) NOT NULL COMMENT 'Action performed: CREATE, UPDATE, DELETE, DEACTIVATE, REACTIVATE, etc.';
ALTER TABLE audit_logs MODIFY COLUMN entity_type VARCHAR(64) DEFAULT NULL COMMENT 'Entity type: account, account_type, item, invoice, etc.';
ALTER TABLE audit_logs MODIFY COLUMN entity_id VARCHAR(128) DEFAULT NULL COMMENT 'ID of the affected entity';
ALTER TABLE audit_logs MODIFY COLUMN payload_json LONGTEXT NOT NULL COMMENT 'Original payload or context data';
ALTER TABLE audit_logs MODIFY COLUMN changes_json LONGTEXT DEFAULT NULL COMMENT 'Before/after changes for updates (JSON format)';
