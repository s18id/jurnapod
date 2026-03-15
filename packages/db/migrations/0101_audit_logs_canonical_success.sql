-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Make audit_logs.success the canonical field, drop result CHECK constraint

-- Step 1: Ensure success is populated from result for any NULL values
UPDATE audit_logs
SET success = IF(result = 'SUCCESS', 1, 0)
WHERE success IS NULL OR success NOT IN (0, 1);

-- Step 2: Drop the old CHECK constraint on result (if it exists)
SET @is_mariadb := IF(VERSION() LIKE '%MariaDB%', 1, 0);

SET @constraint_exists = (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'chk_audit_logs_result'
      AND CONSTRAINT_TYPE = 'CHECK'
);

SET @drop_constraint_sql := IF(
    @constraint_exists > 0,
    IF(
      @is_mariadb = 1,
      'ALTER TABLE audit_logs DROP CONSTRAINT chk_audit_logs_result',
      'ALTER TABLE audit_logs DROP CHECK chk_audit_logs_result'
    ),
    'SELECT ''Constraint chk_audit_logs_result does not exist, skipping'''
);

PREPARE stmt FROM @drop_constraint_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: Add CHECK constraint on success (canonical field)
SET @success_constraint_exists = (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'chk_audit_logs_success'
      AND CONSTRAINT_TYPE = 'CHECK'
);

SET @add_constraint_sql := IF(
    @success_constraint_exists = 0,
    'ALTER TABLE audit_logs ADD CONSTRAINT chk_audit_logs_success CHECK (success IN (0, 1))',
    'SELECT ''Constraint chk_audit_logs_success already exists, skipping'''
);

PREPARE stmt FROM @add_constraint_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
