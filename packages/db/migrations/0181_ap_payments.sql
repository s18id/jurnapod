-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0181_ap_payments.sql
-- Story 46.6 Scope A: AP Payments schema foundation
-- Description: Create ap_payments and ap_payment_lines tables
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ap_payments: header table for AP payment transactions
CREATE TABLE IF NOT EXISTS ap_payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    payment_no VARCHAR(32) NOT NULL,
    payment_date DATE NOT NULL,
    bank_account_id BIGINT UNSIGNED NOT NULL,
    supplier_id INT NOT NULL,
    description VARCHAR(1000) DEFAULT NULL,
    status TINYINT UNSIGNED NOT NULL DEFAULT 10,
    journal_batch_id BIGINT UNSIGNED DEFAULT NULL,
    posted_at DATETIME DEFAULT NULL,
    posted_by_user_id INT UNSIGNED DEFAULT NULL,
    voided_at DATETIME DEFAULT NULL,
    voided_by_user_id INT UNSIGNED DEFAULT NULL,
    created_by_user_id INT UNSIGNED DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_ap_payments_company_payment_no (company_id, payment_no),
    INDEX idx_ap_payments_company_id (company_id),
    INDEX idx_ap_payments_supplier_id (supplier_id),
    INDEX idx_ap_payments_status (status),
    INDEX idx_ap_payments_bank_account_id (bank_account_id),

    CONSTRAINT fk_ap_payments_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ap_payments_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ap_payments_bank_account FOREIGN KEY (bank_account_id) REFERENCES accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ap_payments_journal_batch FOREIGN KEY (journal_batch_id) REFERENCES journal_batches(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ap_payment_lines: line items for AP payments (applies to purchase invoices)
CREATE TABLE IF NOT EXISTS ap_payment_lines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ap_payment_id BIGINT UNSIGNED NOT NULL,
    line_no INT UNSIGNED NOT NULL,
    purchase_invoice_id BIGINT UNSIGNED NOT NULL,
    allocation_amount DECIMAL(19,4) NOT NULL,
    description VARCHAR(1000) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_ap_payment_lines_payment_line (ap_payment_id, line_no),
    INDEX idx_ap_payment_lines_payment_id (ap_payment_id),
    INDEX idx_ap_payment_lines_invoice_id (purchase_invoice_id),

    CONSTRAINT fk_ap_payment_lines_payment FOREIGN KEY (ap_payment_id) REFERENCES ap_payments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_ap_payment_lines_invoice FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
