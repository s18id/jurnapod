-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Create inventory_transactions table (audit trail)
-- Purpose: Track all stock movements for audit and reconciliation
-- Portable across MySQL 8.0+ and MariaDB

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED DEFAULT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  transaction_type ENUM('SALE', 'REFUND', 'ADJUSTMENT', 'RECEIPT', 'TRANSFER') NOT NULL,
  quantity_delta DECIMAL(15,4) NOT NULL,
  reference_type VARCHAR(64) DEFAULT NULL,
  reference_id VARCHAR(64) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inventory_transactions_company_created (company_id, created_at),
  KEY idx_inventory_transactions_product_created (product_id, created_at),
  KEY idx_inventory_transactions_company_product (company_id, product_id),
  KEY idx_inventory_transactions_outlet (outlet_id),
  KEY idx_inventory_transactions_type (transaction_type),
  KEY idx_inventory_transactions_reference (reference_type, reference_id),
  KEY idx_inventory_transactions_created_by (created_by),
  CONSTRAINT fk_inventory_transactions_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_inventory_transactions_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  CONSTRAINT fk_inventory_transactions_product FOREIGN KEY (product_id) REFERENCES items(id),
  CONSTRAINT fk_inventory_transactions_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- Add composite index for transaction lookups by company and date range
-- ============================================================
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inventory_transactions'
    AND INDEX_NAME = 'idx_inventory_transactions_company_type_created'
);

SET @stmt = IF(
  @idx_exists = 0,
  'ALTER TABLE inventory_transactions ADD INDEX idx_inventory_transactions_company_type_created (company_id, transaction_type, created_at)',
  'SELECT ''skip add idx_inventory_transactions_company_type_created'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
