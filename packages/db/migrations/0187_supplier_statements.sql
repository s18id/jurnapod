-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0187_supplier_statements.sql
-- Epic 47 Wave 0: Batch 1 schema blockers - supplier_statements
-- Description: Create supplier_statements table for AP reconciliation
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE IF NOT EXISTS supplier_statements (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    supplier_id INT NOT NULL,
    statement_date DATE NOT NULL,
    closing_balance DECIMAL(19,4) NOT NULL DEFAULT 0.0000,
    currency_code CHAR(3) NOT NULL,
    status TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1=PENDING, 2=RECONCILED',
    reconciled_at DATETIME DEFAULT NULL,
    reconciled_by_user_id BIGINT UNSIGNED DEFAULT NULL,
    created_by_user_id BIGINT UNSIGNED DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_supplier_statements_company_supplier_date (company_id, supplier_id, statement_date),
    INDEX idx_supplier_statements_company_id (company_id),
    INDEX idx_supplier_statements_supplier_id (supplier_id),
    INDEX idx_supplier_statements_status (status),
    INDEX idx_supplier_statements_statement_date (statement_date),

    CONSTRAINT fk_supplier_statements_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_supplier_statements_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_supplier_statements_reconciled_by_user FOREIGN KEY (reconciled_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_supplier_statements_created_by_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
