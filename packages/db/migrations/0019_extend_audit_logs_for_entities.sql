-- Migration: Extend audit_logs table to support entity-specific tracking
-- This adds columns to track what entity was affected and what changed

ALTER TABLE audit_logs
  ADD COLUMN entity_type VARCHAR(64) DEFAULT NULL AFTER user_id,
  ADD COLUMN entity_id VARCHAR(128) DEFAULT NULL AFTER entity_type,
  ADD COLUMN changes_json LONGTEXT DEFAULT NULL AFTER payload_json,
  ADD CONSTRAINT chk_audit_logs_changes_json CHECK (changes_json IS NULL OR JSON_VALID(changes_json));

-- Add index for entity lookups
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at);

-- Add index for company+entity lookups
CREATE INDEX idx_audit_logs_company_entity ON audit_logs(company_id, entity_type, created_at);

-- Comments for documentation
ALTER TABLE audit_logs MODIFY COLUMN action VARCHAR(64) NOT NULL COMMENT 'Action performed: CREATE, UPDATE, DELETE, DEACTIVATE, REACTIVATE, etc.';
ALTER TABLE audit_logs MODIFY COLUMN entity_type VARCHAR(64) DEFAULT NULL COMMENT 'Entity type: account, account_type, item, invoice, etc.';
ALTER TABLE audit_logs MODIFY COLUMN entity_id VARCHAR(128) DEFAULT NULL COMMENT 'ID of the affected entity';
ALTER TABLE audit_logs MODIFY COLUMN payload_json LONGTEXT NOT NULL DEFAULT '{}' COMMENT 'Original payload or context data';
ALTER TABLE audit_logs MODIFY COLUMN changes_json LONGTEXT DEFAULT NULL COMMENT 'Before/after changes for updates (JSON format)';
