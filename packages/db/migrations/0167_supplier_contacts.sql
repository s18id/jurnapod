-- Migration: 0167_supplier_contacts.sql
-- Story 46.1: Supplier Master - Create supplier_contacts table
-- Created: 2026-04-19

CREATE TABLE IF NOT EXISTS supplier_contacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id INT NOT NULL,
    name VARCHAR(191) NOT NULL,
    email VARCHAR(191) DEFAULT NULL,
    phone VARCHAR(32) DEFAULT NULL,
    role VARCHAR(96) DEFAULT NULL,
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    notes TEXT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_supplier_contacts_supplier_id (supplier_id),
    
    CONSTRAINT fk_supplier_contacts_supplier FOREIGN KEY (supplier_id) 
        REFERENCES suppliers(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
