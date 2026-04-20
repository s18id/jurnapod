-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0191_ap_reconciliation_snapshot_audit_trail.sql
-- Story 47.6 Batch A S1-S2: Audit trail table + immutability triggers
-- Description: Create audit trail for snapshot changes with DB-level append-only enforcement
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ap_reconciliation_audit_trail: immutable audit log for snapshot lifecycle
CREATE TABLE IF NOT EXISTS ap_reconciliation_audit_trail (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    snapshot_id BIGINT UNSIGNED NOT NULL COMMENT 'Snapshot this audit entry pertains to',
    previous_snapshot_id BIGINT UNSIGNED NULL COMMENT 'Prior snapshot for same as_of_date if applicable',
    action_type VARCHAR(32) NOT NULL COMMENT 'CREATED | RECALCULATED | ARCHIVED | EXPORTED',
    change_summary JSON NOT NULL COMMENT 'Machine-readable diff: {fields: [...], before: {}, after: {}}',
    change_reason VARCHAR(255) DEFAULT NULL COMMENT 'Human-readable: journal_posted, invoice_voided, manual_adjustment',
    changed_by BIGINT UNSIGNED NOT NULL,
    changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSON DEFAULT NULL COMMENT 'Additional context: affected_tx_ids, account_set_delta, etc.',

    -- Query efficiency
    INDEX idx_audit_company_snapshot (company_id, snapshot_id),
    INDEX idx_audit_company_date (company_id, changed_at),
    INDEX idx_audit_previous (previous_snapshot_id),

    CONSTRAINT fk_audit_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_audit_snapshot FOREIGN KEY (snapshot_id) REFERENCES ap_reconciliation_snapshots(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_audit_previous_snapshot FOREIGN KEY (previous_snapshot_id) REFERENCES ap_reconciliation_snapshots(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_audit_changed_by FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Immutable audit trail for AP reconciliation snapshot changes';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;

-- =====================================================
-- Immutability triggers for ap_reconciliation_snapshots
-- =====================================================

SET FOREIGN_KEY_CHECKS=0;

DROP TRIGGER IF EXISTS trg_ap_reconciliation_snapshots_before_update;
CREATE TRIGGER trg_ap_reconciliation_snapshots_before_update
BEFORE UPDATE ON ap_reconciliation_snapshots
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'ap_reconciliation_snapshots is append-only: UPDATE is not allowed';

DROP TRIGGER IF EXISTS trg_ap_reconciliation_snapshots_before_delete;
CREATE TRIGGER trg_ap_reconciliation_snapshots_before_delete
BEFORE DELETE ON ap_reconciliation_snapshots
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'ap_reconciliation_snapshots is append-only: DELETE is not allowed';

-- =====================================================
-- Immutability triggers for ap_reconciliation_audit_trail
-- =====================================================

DROP TRIGGER IF EXISTS trg_ap_reconciliation_audit_trail_before_update;
CREATE TRIGGER trg_ap_reconciliation_audit_trail_before_update
BEFORE UPDATE ON ap_reconciliation_audit_trail
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'ap_reconciliation_audit_trail is append-only: UPDATE is not allowed';

DROP TRIGGER IF EXISTS trg_ap_reconciliation_audit_trail_before_delete;
CREATE TRIGGER trg_ap_reconciliation_audit_trail_before_delete
BEFORE DELETE ON ap_reconciliation_audit_trail
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'ap_reconciliation_audit_trail is append-only: DELETE is not allowed';

SET FOREIGN_KEY_CHECKS=1;
