-- Migration: 0095_account_mapping_type_ids.sql
-- Story: 4.9 Account Mapping Key INT Constants
-- Description: Introduce canonical account_mapping_types and mapping_type_id references
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE IF NOT EXISTS `account_mapping_types` (
  `id` tinyint(3) unsigned NOT NULL,
  `code` varchar(64) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_account_mapping_types_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `account_mapping_types` (`id`, `code`) VALUES
  (1, 'AR'),
  (2, 'SALES_REVENUE'),
  (3, 'SALES_RETURNS'),
  (4, 'INVOICE_PAYMENT_BANK'),
  (5, 'PAYMENT_VARIANCE_GAIN'),
  (6, 'PAYMENT_VARIANCE_LOSS'),
  (7, 'COGS_DEFAULT'),
  (8, 'INVENTORY_ASSET_DEFAULT'),
  (9, 'CASH'),
  (10, 'QRIS'),
  (11, 'CARD'),
  (12, 'SALES_DISCOUNTS')
ON DUPLICATE KEY UPDATE
  `code` = VALUES(`code`),
  `updated_at` = current_timestamp();

SET @company_has_mapping_type_id = (
  SELECT COUNT(*) > 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_account_mappings'
    AND COLUMN_NAME = 'mapping_type_id'
);

SET @ddl = IF(
  @company_has_mapping_type_id = 1,
  'SELECT ''company_account_mappings.mapping_type_id already exists'' AS status',
  'ALTER TABLE company_account_mappings ADD COLUMN mapping_type_id TINYINT UNSIGNED NULL AFTER mapping_key'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @outlet_has_mapping_type_id = (
  SELECT COUNT(*) > 0 FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlet_account_mappings'
    AND COLUMN_NAME = 'mapping_type_id'
);

SET @ddl = IF(
  @outlet_has_mapping_type_id = 1,
  'SELECT ''outlet_account_mappings.mapping_type_id already exists'' AS status',
  'ALTER TABLE outlet_account_mappings ADD COLUMN mapping_type_id TINYINT UNSIGNED NULL AFTER mapping_key'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE company_account_mappings cam
JOIN account_mapping_types amt ON amt.code = cam.mapping_key
SET cam.mapping_type_id = amt.id
WHERE cam.mapping_type_id IS NULL;

UPDATE outlet_account_mappings oam
JOIN account_mapping_types amt ON amt.code = oam.mapping_key
SET oam.mapping_type_id = amt.id
WHERE oam.mapping_type_id IS NULL;

SET @company_fk_exists = (
  SELECT COUNT(*) > 0 FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_account_mappings'
    AND CONSTRAINT_NAME = 'fk_company_account_mappings_mapping_type'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @ddl = IF(
  @company_fk_exists = 1,
  'SELECT ''fk_company_account_mappings_mapping_type already exists'' AS status',
  'ALTER TABLE company_account_mappings ADD CONSTRAINT fk_company_account_mappings_mapping_type FOREIGN KEY (mapping_type_id) REFERENCES account_mapping_types(id)'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @outlet_fk_exists = (
  SELECT COUNT(*) > 0 FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlet_account_mappings'
    AND CONSTRAINT_NAME = 'fk_outlet_account_mappings_mapping_type'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @ddl = IF(
  @outlet_fk_exists = 1,
  'SELECT ''fk_outlet_account_mappings_mapping_type already exists'' AS status',
  'ALTER TABLE outlet_account_mappings ADD CONSTRAINT fk_outlet_account_mappings_mapping_type FOREIGN KEY (mapping_type_id) REFERENCES account_mapping_types(id)'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @company_unique_exists = (
  SELECT COUNT(*) > 0 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'company_account_mappings'
    AND INDEX_NAME = 'uq_company_account_mappings_type'
);

SET @ddl = IF(
  @company_unique_exists = 1,
  'SELECT ''uq_company_account_mappings_type already exists'' AS status',
  'ALTER TABLE company_account_mappings ADD UNIQUE KEY uq_company_account_mappings_type (company_id, mapping_type_id)'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @outlet_unique_exists = (
  SELECT COUNT(*) > 0 FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlet_account_mappings'
    AND INDEX_NAME = 'uq_outlet_account_mappings_scope_type'
);

SET @ddl = IF(
  @outlet_unique_exists = 1,
  'SELECT ''uq_outlet_account_mappings_scope_type already exists'' AS status',
  'ALTER TABLE outlet_account_mappings ADD UNIQUE KEY uq_outlet_account_mappings_scope_type (company_id, outlet_id, mapping_type_id)'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
