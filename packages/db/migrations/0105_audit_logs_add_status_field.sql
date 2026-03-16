-- Migration 0105: Add status TINYINT field to audit_logs
-- Replace success field with more granular status codes
-- Status codes: 1=SUCCESS, 0=FAIL, 2=PARTIAL, 3=PENDING, 4=CANCELLED, 5=TIMEOUT, 6=RETRY, 7=CORRUPTED

-- Check if status column already exists
SET @status_column_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'audit_logs' 
      AND COLUMN_NAME = 'status'
);

-- Add status column if it doesn't exist
SET @sql = IF(
    @status_column_exists = 0,
    'ALTER TABLE audit_logs ADD COLUMN status TINYINT NOT NULL DEFAULT 1 AFTER success',
    'SELECT ''Column status already exists, skipping'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill status from success field (only for rows that still have default status = 1)
UPDATE audit_logs 
SET status = success 
WHERE status = 1;

-- Check if constraint already exists
SET @status_constraint_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'audit_logs' 
      AND CONSTRAINT_NAME = 'chk_audit_logs_status'
);

-- Add constraint for valid status codes
SET @sql = IF(
    @status_constraint_exists = 0,
    'ALTER TABLE audit_logs ADD CONSTRAINT chk_audit_logs_status CHECK (status BETWEEN 0 AND 7)',
    'SELECT ''Constraint chk_audit_logs_status already exists, skipping'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;