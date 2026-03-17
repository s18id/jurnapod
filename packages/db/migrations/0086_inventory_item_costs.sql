-- Migration: 0086_inventory_item_costs.sql
-- Story: 4.6 Cost Tracking Methods
-- Description: Summary table for current costing method and AVG cache
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Create inventory_item_costs table if not exists
SELECT COUNT(*) INTO @table_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'inventory_item_costs';

SET @create_table = IF(@table_exists = 0,
  'CREATE TABLE inventory_item_costs (
    company_id BIGINT UNSIGNED NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    costing_method VARCHAR(10) NOT NULL DEFAULT \'AVG\',
    current_avg_cost DECIMAL(18,4) NULL,
    total_layers_qty DECIMAL(18,4) DEFAULT 0,
    total_layers_cost DECIMAL(18,4) DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id, item_id),
    CONSTRAINT fk_item_costs_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_item_costs_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    CONSTRAINT chk_item_costs_method CHECK (costing_method IN (\'AVG\', \'FIFO\', \'LIFO\')),
    CONSTRAINT chk_item_costs_qty_non_negative CHECK (total_layers_qty >= 0),
    CONSTRAINT chk_item_costs_cost_non_negative CHECK (total_layers_cost >= 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');

PREPARE stmt FROM @create_table;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
