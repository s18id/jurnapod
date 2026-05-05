-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0201_allow_archive_path.sql
-- Story 56.1: Archive Flow Trigger Constraint Resolution
-- Description: Modify trg_ap_reconciliation_snapshots_before_update to allow status='ARCHIVED' transitions
--              while preserving the supersession chain update path (0193) and blocking all other mutations.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Replace the existing trigger with one that:
-- 1. Allows archive transitions (NEW.status = 'ARCHIVED')
-- 2. Allows supersession chain updates (setting superseded_by_snapshot_id from NULL -> non-NULL, per 0193)
-- 3. Blocks all other mutations
DROP TRIGGER IF EXISTS trg_ap_reconciliation_snapshots_before_update;
-- lint:allow-business-trigger
CREATE TRIGGER trg_ap_reconciliation_snapshots_before_update
BEFORE UPDATE ON ap_reconciliation_snapshots
FOR EACH ROW
BEGIN
  IF NOT (
    NEW.status = 'ARCHIVED'
    OR (OLD.superseded_by_snapshot_id IS NULL AND NEW.superseded_by_snapshot_id IS NOT NULL)
  ) THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'ap_reconciliation_snapshots is append-only: UPDATE is not allowed for non-archive transitions';
  END IF;
END;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;