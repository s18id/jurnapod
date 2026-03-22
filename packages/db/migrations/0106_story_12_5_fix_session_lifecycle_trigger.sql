-- Migration: 0106_story_12_5_fix_session_lifecycle_trigger.sql
-- Purpose: Fix trigger to allow all valid session statuses on INSERT
-- Author: BMAD QA Agent
-- Date: 2026-03-19
-- 
-- CRITICAL: This migration is RERUNNABLE and IDEMPOTENT
-- The existing trigger only allows status_id = 1 on INSERT, but Story 12.5
-- requires support for all statuses: 1=ACTIVE, 2=LOCKED_FOR_PAYMENT, 3=CLOSED

SET FOREIGN_KEY_CHECKS=0;

-- ============================================================================
-- UPDATE: Fix the INSERT trigger to allow all valid status values (1-3)
-- ============================================================================

-- Drop the old restrictive trigger
DROP TRIGGER IF EXISTS trg_service_sessions_lifecycle_bi;

-- Create updated trigger that allows all valid statuses (1, 2, 3)
CREATE TRIGGER trg_service_sessions_lifecycle_bi
BEFORE INSERT ON table_service_sessions
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
  NEW.status_id = IF(NEW.status_id BETWEEN 1 AND 3, NEW.status_id, NULL);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 'trg_service_sessions_lifecycle_bi trigger updated' AS message;
SHOW CREATE TRIGGER trg_service_sessions_lifecycle_bi;

SET FOREIGN_KEY_CHECKS=1;
