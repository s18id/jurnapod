-- Migration: 0107_story_12_5_fix_session_update_trigger.sql
-- Purpose: Fix UPDATE trigger to allow status transitions per Story 12.5
-- Author: BMAD QA Agent
-- Date: 2026-03-19
-- 
-- CRITICAL: This migration is RERUNNABLE and IDEMPOTENT
-- The existing trigger only allows: 1→2, 1→3
-- Story 12.5 requires: 1→2 (ACTIVE→LOCKED), 1→3 (ACTIVE→CLOSED), 2→3 (LOCKED→CLOSED)

SET FOREIGN_KEY_CHECKS=0;

-- ============================================================================
-- UPDATE: Fix the UPDATE trigger to allow all valid status transitions
-- ============================================================================

-- Drop the old restrictive trigger
DROP TRIGGER IF EXISTS trg_service_sessions_lifecycle_bu;

-- Create updated trigger that allows all valid status transitions:
-- - 1 (ACTIVE) → 2 (LOCKED_FOR_PAYMENT)
-- - 1 (ACTIVE) → 3 (CLOSED)
-- - 2 (LOCKED_FOR_PAYMENT) → 3 (CLOSED)
CREATE TRIGGER trg_service_sessions_lifecycle_bu
BEFORE UPDATE ON table_service_sessions
FOR EACH ROW
SET
  NEW.table_id = IF(
    EXISTS (
      SELECT 1
      FROM outlet_tables ot
      WHERE ot.id = NEW.table_id
        AND ot.company_id = NEW.company_id
        AND ot.outlet_id = NEW.outlet_id
    ),
    NEW.table_id,
    NULL
  ),
  NEW.status_id = IF(
    NEW.status_id = OLD.status_id
    OR (OLD.status_id = 1 AND NEW.status_id IN (2, 3))
    OR (OLD.status_id = 2 AND NEW.status_id = 3),
    NEW.status_id,
    NULL
  );

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 'trg_service_sessions_lifecycle_bu trigger updated' AS message;
SHOW CREATE TRIGGER trg_service_sessions_lifecycle_bu;

SET FOREIGN_KEY_CHECKS=1;
