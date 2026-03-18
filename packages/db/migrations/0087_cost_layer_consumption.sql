-- Migration: 0087_cost_layer_consumption.sql
-- Story: 4.6 Cost Tracking Methods
-- Description: Consumption trace table for auditability
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Create cost_layer_consumption table if not exists
SELECT COUNT(*) INTO @table_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'cost_layer_consumption';

SET @create_table = IF(@table_exists = 0,
  'CREATE TABLE cost_layer_consumption (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    layer_id BIGINT UNSIGNED NOT NULL,
    transaction_id BIGINT UNSIGNED NOT NULL,
    consumed_qty DECIMAL(18,4) NOT NULL,
    unit_cost DECIMAL(18,4) NOT NULL,
    total_cost DECIMAL(18,4) NOT NULL,
    consumed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_layer_consumption (layer_id),
    INDEX idx_transaction_consumption (company_id, transaction_id),
    INDEX idx_consumed_at (consumed_at),
    CONSTRAINT fk_consumption_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumption_layer FOREIGN KEY (layer_id) REFERENCES inventory_cost_layers(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumption_transaction FOREIGN KEY (transaction_id) REFERENCES inventory_transactions(id) ON DELETE CASCADE,
    CONSTRAINT chk_consumption_qty_positive CHECK (consumed_qty > 0),
    CONSTRAINT chk_consumption_unit_cost_non_negative CHECK (unit_cost >= 0),
    CONSTRAINT chk_consumption_total_cost_non_negative CHECK (total_cost >= 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');

PREPARE stmt FROM @create_table;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
