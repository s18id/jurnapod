-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0193_ap_reconciliation_snapshots_supersession_trigger.sql
-- Story 47.6 hardening: allow internal supersession chain update only
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

-- Replace strict UPDATE trigger with constrained variant:
-- allowed update path is ONLY setting superseded_by_snapshot_id from NULL -> non-NULL
-- while all immutable financial/input fields remain unchanged.

DROP TRIGGER IF EXISTS trg_ap_reconciliation_snapshots_before_update;

CREATE TRIGGER trg_ap_reconciliation_snapshots_before_update
BEFORE UPDATE ON ap_reconciliation_snapshots
FOR EACH ROW
BEGIN
  IF NOT (
    OLD.company_id <=> NEW.company_id
    AND OLD.as_of_date <=> NEW.as_of_date
    AND OLD.timezone <=> NEW.timezone
    AND OLD.snapshot_version <=> NEW.snapshot_version
    AND OLD.ap_subledger_balance <=> NEW.ap_subledger_balance
    AND OLD.gl_control_balance <=> NEW.gl_control_balance
    AND OLD.variance <=> NEW.variance
    AND OLD.configured_account_ids_json <=> NEW.configured_account_ids_json
    AND OLD.account_source <=> NEW.account_source
    AND OLD.inputs_hash <=> NEW.inputs_hash
    AND OLD.created_by <=> NEW.created_by
    AND OLD.auto_generated <=> NEW.auto_generated
    AND OLD.created_at <=> NEW.created_at
    AND OLD.status <=> NEW.status
    AND OLD.retention_policy_years <=> NEW.retention_policy_years
    AND OLD.archived_at <=> NEW.archived_at
    AND OLD.archive_version <=> NEW.archive_version
    AND OLD.superseded_by_snapshot_id IS NULL
    AND NEW.superseded_by_snapshot_id IS NOT NULL
  ) THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'ap_reconciliation_snapshots is append-only: UPDATE is not allowed';
  END IF;
END;
