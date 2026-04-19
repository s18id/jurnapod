-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0188_ap_exceptions.sql
-- Epic 47 Wave 0: Batch 1 schema blockers - ap_exceptions
-- Description: Create ap_exceptions table for AP automation variance tracking
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE IF NOT EXISTS ap_exceptions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    exception_key VARCHAR(255) NOT NULL COMMENT 'Deterministic idempotency key: SHA256(source_type:source_id:field)',
    type TINYINT UNSIGNED NOT NULL COMMENT '1=DISPUTE, 2=VARIANCE, 3=MISMATCH, 4=DUPLICATE',
    source_type VARCHAR(64) NOT NULL COMMENT 'e.g., INVOICE, PAYMENT, CREDIT_NOTE',
    source_id BIGINT UNSIGNED NOT NULL,
    supplier_id INT DEFAULT NULL,
    variance_amount DECIMAL(19,4) DEFAULT NULL,
    currency_code CHAR(3) DEFAULT NULL,
    detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    due_date DATE DEFAULT NULL,
    assigned_to_user_id BIGINT UNSIGNED DEFAULT NULL,
    assigned_at DATETIME DEFAULT NULL,
    status TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1=OPEN, 2=ASSIGNED, 3=RESOLVED, 4=DISMISSED',
    resolved_at DATETIME DEFAULT NULL,
    resolved_by_user_id BIGINT UNSIGNED DEFAULT NULL,
    resolution_note TEXT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_ap_exceptions_company_exception_key (company_id, exception_key),
    INDEX idx_ap_exceptions_company_id (company_id),
    INDEX idx_ap_exceptions_supplier_id (supplier_id),
    INDEX idx_ap_exceptions_type (type),
    INDEX idx_ap_exceptions_status (status),
    INDEX idx_ap_exceptions_detected_at (detected_at),
    INDEX idx_ap_exceptions_due_date (due_date),
    INDEX idx_ap_exceptions_assigned_to_user_id (assigned_to_user_id),
    INDEX idx_ap_exceptions_source (source_type, source_id),

    CONSTRAINT fk_ap_exceptions_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ap_exceptions_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_ap_exceptions_assigned_to_user FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_ap_exceptions_resolved_by_user FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
