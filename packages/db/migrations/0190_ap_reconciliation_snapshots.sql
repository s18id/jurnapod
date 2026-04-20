-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0190_ap_reconciliation_snapshots.sql
-- Story 47.6 Batch A S1: AP Reconciliation Snapshots table
-- Description: Create append-only snapshot table for AP reconciliation point-in-time captures
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE IF NOT EXISTS ap_reconciliation_snapshots (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    as_of_date DATE NOT NULL,
    timezone VARCHAR(64) NOT NULL COMMENT 'Resolved at snapshot time: outlet.timezone -> company.timezone',
    snapshot_version INT UNSIGNED NOT NULL COMMENT 'Monotonically increasing per (company_id, as_of_date)',
    ap_subledger_balance DECIMAL(19,4) NOT NULL DEFAULT 0.0000,
    gl_control_balance DECIMAL(19,4) NOT NULL DEFAULT 0.0000,
    variance DECIMAL(19,4) NOT NULL DEFAULT 0.0000,
    configured_account_ids_json JSON NOT NULL COMMENT 'Resolved account-set at snapshot time',
    account_source VARCHAR(64) NOT NULL COMMENT 'settings | fallback_company_default',
    inputs_hash CHAR(64) NOT NULL COMMENT 'Deterministic checksum of effective inputs',
    created_by BIGINT UNSIGNED NOT NULL,
    auto_generated TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0=manual, 1=auto period-close snapshot',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    superseded_by_snapshot_id BIGINT UNSIGNED NULL COMMENT 'Chains to newer snapshot version if superseded',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE | ARCHIVED',
    retention_policy_years TINYINT UNSIGNED DEFAULT NULL COMMENT 'Policy support: NULL=indefinite, N=retain N years',
    archived_at DATETIME DEFAULT NULL COMMENT 'When snapshot was archived (policy support only)',
    archive_version VARCHAR(64) DEFAULT NULL COMMENT 'Archive storage reference (policy support only)',

    -- Versioning chain uniqueness
    UNIQUE KEY uk_snapshot_version_chain (company_id, as_of_date, snapshot_version),
    -- Query efficiency for date-range listings
    INDEX idx_snapshot_company_date (company_id, as_of_date, created_at),
    -- Auto/manual filtering
    INDEX idx_snapshot_company_auto_date (company_id, auto_generated, as_of_date),
    -- Status filtering
    INDEX idx_snapshot_company_status (company_id, status),
    -- Supersession chain lookup
    INDEX idx_snapshot_superseded (superseded_by_snapshot_id),

    CONSTRAINT fk_snapshot_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_snapshot_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_snapshot_superseded_by FOREIGN KEY (superseded_by_snapshot_id) REFERENCES ap_reconciliation_snapshots(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Immutable AP reconciliation snapshots for audit compliance';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
