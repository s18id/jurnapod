-- Migration: 0166_suppliers.sql
-- Story 46.1: Supplier Master - Create suppliers table
-- Created: 2026-04-19

CREATE TABLE IF NOT EXISTS suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(191) NOT NULL,
    email VARCHAR(191) DEFAULT NULL,
    phone VARCHAR(32) DEFAULT NULL,
    address_line1 VARCHAR(191) DEFAULT NULL,
    address_line2 VARCHAR(191) DEFAULT NULL,
    city VARCHAR(96) DEFAULT NULL,
    postal_code VARCHAR(20) DEFAULT NULL,
    country VARCHAR(64) DEFAULT NULL,
    currency CHAR(3) NOT NULL,
    credit_limit DECIMAL(19,4) NOT NULL DEFAULT 0.0000,
    payment_terms_days INT DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by_user_id INT DEFAULT NULL,
    updated_by_user_id INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_suppliers_company_code (company_id, code),
    INDEX idx_suppliers_company_id (company_id),
    INDEX idx_suppliers_company_active (company_id, is_active),
    
    CONSTRAINT fk_suppliers_company FOREIGN KEY (company_id) 
        REFERENCES companies(id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
