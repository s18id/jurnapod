-- Migration: 0088_item_variants.sql
-- Story: 4.7 Item Variants
-- Description: Add variant support for products (size, color, style)
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Create item_variant_attributes table
SELECT COUNT(*) INTO @table_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'item_variant_attributes';

SET @create_table = IF(@table_exists = 0,
  'CREATE TABLE item_variant_attributes (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    attribute_name VARCHAR(50) NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_item_attribute (company_id, item_id, attribute_name),
    INDEX idx_sort (company_id, item_id, sort_order),
    CONSTRAINT fk_variant_attr_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_variant_attr_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');

PREPARE stmt FROM @create_table;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create item_variant_attribute_values table
SELECT COUNT(*) INTO @table_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'item_variant_attribute_values';

SET @create_table = IF(@table_exists = 0,
  'CREATE TABLE item_variant_attribute_values (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    attribute_id BIGINT UNSIGNED NOT NULL,
    value VARCHAR(50) NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_attribute_value (company_id, attribute_id, value),
    INDEX idx_sort (company_id, attribute_id, sort_order),
    CONSTRAINT fk_attr_val_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_attr_val_attribute FOREIGN KEY (attribute_id) REFERENCES item_variant_attributes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');

PREPARE stmt FROM @create_table;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create item_variants table
SELECT COUNT(*) INTO @table_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'item_variants';

SET @create_table = IF(@table_exists = 0,
  'CREATE TABLE item_variants (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    item_id BIGINT UNSIGNED NOT NULL,
    sku VARCHAR(100) NOT NULL,
    variant_name VARCHAR(255) NOT NULL,
    price_override DECIMAL(15,2) NULL,
    stock_quantity DECIMAL(10,3) DEFAULT 0,
    barcode VARCHAR(100) NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_company_sku (company_id, sku),
    INDEX idx_item (company_id, item_id),
    INDEX idx_barcode (company_id, barcode),
    INDEX idx_active (company_id, item_id, is_active),
    CONSTRAINT fk_variant_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_variant_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    CONSTRAINT chk_variant_stock_non_negative CHECK (stock_quantity >= 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');

PREPARE stmt FROM @create_table;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create item_variant_combinations table
SELECT COUNT(*) INTO @table_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'item_variant_combinations';

SET @create_table = IF(@table_exists = 0,
  'CREATE TABLE item_variant_combinations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED NOT NULL,
    attribute_id BIGINT UNSIGNED NOT NULL,
    value_id BIGINT UNSIGNED NOT NULL,
    UNIQUE KEY uk_variant_attribute (company_id, variant_id, attribute_id),
    INDEX idx_variant (company_id, variant_id),
    INDEX idx_attribute_value (company_id, attribute_id, value_id),
    CONSTRAINT fk_variant_combo_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_variant_combo_variant FOREIGN KEY (variant_id) REFERENCES item_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_variant_combo_attribute FOREIGN KEY (attribute_id) REFERENCES item_variant_attributes(id) ON DELETE CASCADE,
    CONSTRAINT fk_variant_combo_value FOREIGN KEY (value_id) REFERENCES item_variant_attribute_values(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');

PREPARE stmt FROM @create_table;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;