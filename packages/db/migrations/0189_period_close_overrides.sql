-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0189_period_close_overrides.sql
-- Epic 47: Period-close guardrails for AP
-- Description: Create period_close_overrides table for closed-period override audit trail
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

-- FIX(47.5-WP-A2): Create period_close_overrides with append-only immutability

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE IF NOT EXISTS period_close_overrides (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL COMMENT 'User who performed the override',
    transaction_type VARCHAR(64) NOT NULL COMMENT 'e.g., PURCHASE_INVOICE, AP_PAYMENT, PURCHASE_CREDIT',
    transaction_id BIGINT UNSIGNED NOT NULL COMMENT 'ID of the AP document being overridden',
    period_id BIGINT UNSIGNED NOT NULL COMMENT 'Fiscal period that was closed',
    reason VARCHAR(500) NOT NULL COMMENT 'Mandatory reason for override',
    overridden_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the override was applied',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_period_close_overrides_company_id (company_id),
    INDEX idx_period_close_overrides_period_id (period_id),
    INDEX idx_period_close_overrides_overridden_at (overridden_at),
    INDEX idx_period_close_overrides_tx (transaction_type, transaction_id),
    INDEX idx_period_close_overrides_company_period (company_id, period_id),

    CONSTRAINT fk_period_close_overrides_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_period_close_overrides_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_period_close_overrides_period FOREIGN KEY (period_id) REFERENCES fiscal_periods(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only immutability: block UPDATE and DELETE on period_close_overrides
-- FIX(47.5-WP-A2): Immutability triggers to enforce append-only audit semantics
-- FIX(47.5-Remediation): Rewritten without DELIMITER for mysql2 multipleStatements runner
-- Strategy: run DROP IF EXISTS + CREATE in one multi-statement batch; mysql2 parses
-- the semicolon between the two statements and sends them separately to the server.

-- Marker: immutability triggers for period_close_overrides
DROP TRIGGER IF EXISTS trg_period_close_overrides_update;
CREATE TRIGGER trg_period_close_overrides_update
BEFORE UPDATE ON period_close_overrides
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'UPDATE not allowed on period_close_overrides — append-only audit table';
END;

DROP TRIGGER IF EXISTS trg_period_close_overrides_delete;
CREATE TRIGGER trg_period_close_overrides_delete
BEFORE DELETE ON period_close_overrides
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'DELETE not allowed on period_close_overrides — append-only audit table';
END;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;