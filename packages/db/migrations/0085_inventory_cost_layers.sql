-- Migration: 0085_inventory_cost_layers.sql
-- Story: 4.6 Cost Tracking Methods
-- Description: Cost layers table for AVG/FIFO/LIFO inventory costing
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Create inventory_cost_layers table if not exists
SELECT COUNT(*) INTO @table_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'inventory_cost_layers';

SET @create_table = IF(@table_exists = 0,
  'CREATE TABLE inventory_cost_layers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    transaction_id BIGINT UNSIGNED NOT NULL,
    unit_cost DECIMAL(18,4) NOT NULL,
    original_qty DECIMAL(18,4) NOT NULL,
    remaining_qty DECIMAL(18,4) NOT NULL,
    acquired_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_item_layers (company_id, item_id, acquired_at, id),
    INDEX idx_remaining (company_id, item_id, remaining_qty),
    INDEX fk_transaction (transaction_id),
    CONSTRAINT fk_cost_layers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_cost_layers_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    CONSTRAINT fk_cost_layers_transaction FOREIGN KEY (transaction_id) REFERENCES inventory_transactions(id) ON DELETE CASCADE,
    CONSTRAINT chk_cost_layers_unit_cost_positive CHECK (unit_cost >= 0),
    CONSTRAINT chk_cost_layers_original_qty_positive CHECK (original_qty > 0),
    CONSTRAINT chk_cost_layers_remaining_qty_non_negative CHECK (remaining_qty >= 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');

PREPARE stmt FROM @create_table;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
