-- Migration: 0084_company_account_mappings_add_cogs_keys.sql
-- Story: 4.5 COGS Integration
-- Description: Expand company_account_mappings keys for optional COGS defaults
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;

SELECT COUNT(*) INTO @check_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'company_account_mappings'
  AND CONSTRAINT_NAME = 'chk_company_account_mappings_key'
  AND CONSTRAINT_TYPE = 'CHECK';

SELECT CHECK_CLAUSE INTO @check_clause
FROM information_schema.CHECK_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND CONSTRAINT_NAME = 'chk_company_account_mappings_key'
LIMIT 1;

SET @has_cogs_default = IF(@check_clause IS NOT NULL AND LOCATE('COGS_DEFAULT', @check_clause) > 0, 1, 0);
SET @has_inventory_asset_default = IF(@check_clause IS NOT NULL AND LOCATE('INVENTORY_ASSET_DEFAULT', @check_clause) > 0, 1, 0);
SET @needs_update = IF(@has_cogs_default = 1 AND @has_inventory_asset_default = 1, 0, 1);
SET @is_mariadb = IF(LOWER(VERSION()) LIKE '%mariadb%', 1, 0);

SET @target_check = "mapping_key in ('AR','SALES_REVENUE','SALES_RETURNS','INVOICE_PAYMENT_BANK','PAYMENT_VARIANCE_GAIN','PAYMENT_VARIANCE_LOSS','COGS_DEFAULT','INVENTORY_ASSET_DEFAULT')";

SET @ddl = IF(
  @needs_update = 0,
  'SELECT 1',
  IF(
    @check_exists = 1,
    CONCAT(
      'ALTER TABLE company_account_mappings ',
      IF(@is_mariadb = 1, 'DROP CONSTRAINT chk_company_account_mappings_key', 'DROP CHECK chk_company_account_mappings_key'),
      ', ADD CONSTRAINT chk_company_account_mappings_key CHECK (', @target_check, ')'
    ),
    CONCAT(
      'ALTER TABLE company_account_mappings ',
      'ADD CONSTRAINT chk_company_account_mappings_key CHECK (', @target_check, ')'
    )
  )
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
