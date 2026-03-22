-- Migration: 0113_story_11_3_sync_idempotency_constraint.sql
-- Purpose: Add outlet_id to pos_transactions unique constraint for multi-outlet idempotency safety
-- Story: Epic 11.3 - Sync Idempotency and Retry Resilience Hardening
-- Author: BMAD AI Agent
-- Date: 2026-03-22
-- 
-- CRITICAL: This migration is RERUNNABLE and IDEMPOTENT for MySQL 8.0+ and MariaDB 10.2+
-- Run it multiple times safely - it checks existence before creating/dropping objects.
-- 
-- Background:
-- The original constraint (company_id, client_tx_id) prevented the same client_tx_id
-- from being used across different outlets within the same company. This is problematic
-- for multi-outlet POS scenarios where each outlet may generate transactions independently
-- and could produce the same client_tx_id values.
-- 
-- The new constraint (company_id, outlet_id, client_tx_id) ensures:
-- 1. Same outlet + same client_tx_id = duplicate (correct behavior)
-- 2. Different outlets + same client_tx_id = allowed (correct for multi-outlet)
-- 3. Audit and reporting can still query by company_id alone using existing indexes

SET FOREIGN_KEY_CHECKS=0;

-- ============================================================================
-- STEP 1: Check for data violations that would prevent the constraint change
-- ============================================================================

-- Find any duplicate (company_id, outlet_id, client_tx_id) combinations
-- that are NOT already duplicates under the current (company_id, client_tx_id) constraint
SELECT COUNT(*) 
INTO @violation_check
FROM (
  SELECT company_id, outlet_id, client_tx_id, COUNT(*) as duplicate_count
  FROM pos_transactions
  GROUP BY company_id, outlet_id, client_tx_id
  HAVING COUNT(*) > 1
) AS violations;

-- If violations exist, raise an error (this would indicate data cleanup is needed)
-- In practice, this should never happen if the original constraint was enforced
-- Signal18 ID - Ahmad Faruk
SET @check_violations = IF(@violation_check > 0, 
  CONCAT('SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Data violation: duplicate (company_id, outlet_id, client_tx_id) found in pos_transactions. Manual data cleanup required before applying this migration.'''),
  'SELECT 1 as no_violations');

PREPARE stmt_check FROM @check_violations;
EXECUTE stmt_check;
DEALLOCATE PREPARE stmt_check;

-- ============================================================================
-- STEP 2: Drop the old unique key constraint
-- ============================================================================

-- Check if the old constraint exists before dropping
SELECT COUNT(*) INTO @old_constraint_exists
FROM information_schema.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'pos_transactions' 
  AND INDEX_NAME = 'uq_pos_transactions_client_tx_id';

-- Drop old unique key if it exists
SET @drop_old_constraint = IF(@old_constraint_exists > 0,
  'ALTER TABLE pos_transactions DROP INDEX uq_pos_transactions_client_tx_id',
  'SELECT 1 as no_op');

PREPARE stmt_drop_old FROM @drop_old_constraint;
EXECUTE stmt_drop_old;
DEALLOCATE PREPARE stmt_drop_old;

-- ============================================================================
-- STEP 3: Add the new unique key constraint with outlet_id
-- ============================================================================

-- Check if the new constraint already exists
SELECT COUNT(*) INTO @new_constraint_exists
FROM information_schema.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'pos_transactions' 
  AND INDEX_NAME = 'uq_pos_transactions_outlet_client_tx';

-- Add new unique key if it doesn't exist
SET @add_new_constraint = IF(@new_constraint_exists = 0,
  'ALTER TABLE pos_transactions ADD UNIQUE INDEX uq_pos_transactions_outlet_client_tx (company_id, outlet_id, client_tx_id) COMMENT ''Idempotency constraint for multi-outlet POS sync (Epic 11.3)''',
  'SELECT 1 as no_op');

PREPARE stmt_add_new FROM @add_new_constraint;
EXECUTE stmt_add_new;
DEALLOCATE PREPARE stmt_add_new;

-- ============================================================================
-- STEP 4: Verify the constraint was created
-- ============================================================================

SELECT COUNT(*) INTO @constraint_verified
FROM information_schema.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'pos_transactions' 
  AND INDEX_NAME = 'uq_pos_transactions_outlet_client_tx';

-- Log verification (in MySQL, we can't raise notices, so this is informational)
SELECT 'Constraint migration complete' as status, @constraint_verified as constraint_exists;

SET FOREIGN_KEY_CHECKS=1;

-- Cleanup user variables
SET @table_exists = NULL;
SET @create_table_events = NULL;
SET @violation_check = NULL;
SET @check_violations = NULL;
SET @old_constraint_exists = NULL;
SET @drop_old_constraint = NULL;
SET @add_new_constraint = NULL;
SET @new_constraint_exists = NULL;
SET @constraint_verified = NULL;
