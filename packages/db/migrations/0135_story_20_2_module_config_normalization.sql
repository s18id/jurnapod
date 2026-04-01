-- Migration: 0135_story_20_2_module_config_normalization.sql
-- Story: Epic 20, Story 20.2 - Module Configuration Normalization
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Description: Add explicit typed columns for POS, inventory, sales, and purchasing
--              module settings to replace config_json. Add FK constraints for
--              account_id references where possible.

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- =============================================================================
-- POS Module Columns
-- =============================================================================

-- pos_enabled
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'pos_enabled'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN pos_enabled TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- pos_offline_mode
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'pos_offline_mode'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN pos_offline_mode TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- pos_receipt_template
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'pos_receipt_template'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN pos_receipt_template VARCHAR(255) NOT NULL DEFAULT ''default''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- pos_auto_sync
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'pos_auto_sync'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN pos_auto_sync TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- pos_sync_interval_seconds
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'pos_sync_interval_seconds'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN pos_sync_interval_seconds INT NOT NULL DEFAULT 30',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- pos_require_auth
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'pos_require_auth'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN pos_require_auth TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- pos_allow_discount_after_tax
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'pos_allow_discount_after_tax'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN pos_allow_discount_after_tax TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- pos_tip_adjustment_enabled
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'pos_tip_adjustment_enabled'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN pos_tip_adjustment_enabled TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Inventory Module Columns
-- =============================================================================

-- inventory_enabled
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'inventory_enabled'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN inventory_enabled TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- inventory_multi_warehouse
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'inventory_multi_warehouse'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN inventory_multi_warehouse TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- inventory_warehouses
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'inventory_warehouses'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN inventory_warehouses JSON NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- inventory_auto_reorder
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'inventory_auto_reorder'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN inventory_auto_reorder TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- inventory_low_stock_threshold
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'inventory_low_stock_threshold'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN inventory_low_stock_threshold INT NOT NULL DEFAULT 10',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Sales Module Columns
-- =============================================================================

-- sales_enabled
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'sales_enabled'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN sales_enabled TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sales_tax_mode
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'sales_tax_mode'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN sales_tax_mode ENUM(''inclusive'', ''exclusive'', ''mixed'') NOT NULL DEFAULT ''inclusive''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sales_allow_partial_pay
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'sales_allow_partial_pay'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN sales_allow_partial_pay TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sales_credit_limit_enabled
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'sales_credit_limit_enabled'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN sales_credit_limit_enabled TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Purchasing Module Columns
-- =============================================================================

-- purchasing_enabled
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'purchasing_enabled'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN purchasing_enabled TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- purchasing_approval_workflow
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'purchasing_approval_workflow'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN purchasing_approval_workflow TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- purchasing_credit_limit_enabled
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'purchasing_credit_limit_enabled'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN purchasing_credit_limit_enabled TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- FK Reference Columns (without constraints - referenced tables may not exist)
-- Note: FK constraints will be added separately when referenced tables exist
-- =============================================================================

-- pos_default_payment_method_id (references payment_methods.id - table may not exist)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'pos_default_payment_method_id'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN pos_default_payment_method_id BIGINT UNSIGNED NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- inventory_default_asset_account_id (references accounts.id)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'inventory_default_asset_account_id'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN inventory_default_asset_account_id BIGINT UNSIGNED NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- inventory_default_cogs_account_id (references accounts.id)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'inventory_default_cogs_account_id'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN inventory_default_cogs_account_id BIGINT UNSIGNED NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sales_default_tax_rate_id (references tax_rates.id)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'sales_default_tax_rate_id'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN sales_default_tax_rate_id BIGINT UNSIGNED NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sales_default_price_list_id (references price_lists.id - table may not exist)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'sales_default_price_list_id'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN sales_default_price_list_id BIGINT UNSIGNED NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- sales_default_income_account_id (references accounts.id)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'sales_default_income_account_id'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN sales_default_income_account_id BIGINT UNSIGNED NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- purchasing_default_tax_rate_id (references tax_rates.id)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'purchasing_default_tax_rate_id'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN purchasing_default_tax_rate_id BIGINT UNSIGNED NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- purchasing_default_expense_account_id (references accounts.id)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND column_name = 'purchasing_default_expense_account_id'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE company_modules ADD COLUMN purchasing_default_expense_account_id BIGINT UNSIGNED NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Add FK Constraints for Existing Tables
-- =============================================================================

-- FK for inventory_default_asset_account_id -> accounts(id)
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND constraint_name = 'fk_cm_inventory_asset_account'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE company_modules ADD CONSTRAINT fk_cm_inventory_asset_account FOREIGN KEY (inventory_default_asset_account_id) REFERENCES accounts(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK for inventory_default_cogs_account_id -> accounts(id)
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND constraint_name = 'fk_cm_inventory_cogs_account'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE company_modules ADD CONSTRAINT fk_cm_inventory_cogs_account FOREIGN KEY (inventory_default_cogs_account_id) REFERENCES accounts(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK for sales_default_tax_rate_id -> tax_rates(id)
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND constraint_name = 'fk_cm_sales_default_tax_rate'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE company_modules ADD CONSTRAINT fk_cm_sales_default_tax_rate FOREIGN KEY (sales_default_tax_rate_id) REFERENCES tax_rates(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK for sales_default_income_account_id -> accounts(id)
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND constraint_name = 'fk_cm_sales_income_account'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE company_modules ADD CONSTRAINT fk_cm_sales_income_account FOREIGN KEY (sales_default_income_account_id) REFERENCES accounts(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK for purchasing_default_tax_rate_id -> tax_rates(id)
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND constraint_name = 'fk_cm_purchasing_default_tax_rate'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE company_modules ADD CONSTRAINT fk_cm_purchasing_default_tax_rate FOREIGN KEY (purchasing_default_tax_rate_id) REFERENCES tax_rates(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK for purchasing_default_expense_account_id -> accounts(id)
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints 
  WHERE table_schema = DATABASE() 
    AND table_name = 'company_modules' 
    AND constraint_name = 'fk_cm_purchasing_expense_account'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE company_modules ADD CONSTRAINT fk_cm_purchasing_expense_account FOREIGN KEY (purchasing_default_expense_account_id) REFERENCES accounts(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- Migration: Populate explicit columns from config_json where applicable
-- Only update rows where config_json IS NOT NULL and explicit columns have defaults
-- This is a one-time migration; subsequent updates should use explicit columns
-- =============================================================================

-- Parse config_json for POS module settings
UPDATE company_modules cm
INNER JOIN modules m ON m.id = cm.module_id
SET 
    cm.pos_enabled = COALESCE(cm.pos_enabled, 1),
    cm.pos_offline_mode = COALESCE(JSON_EXTRACT(cm.config_json, '$.offline_mode'), 0),
    cm.pos_receipt_template = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(cm.config_json, '$.receipt_template')), 'default'),
    cm.pos_auto_sync = COALESCE(JSON_EXTRACT(cm.config_json, '$.auto_sync'), 1),
    cm.pos_sync_interval_seconds = COALESCE(JSON_EXTRACT(cm.config_json, '$.sync_interval_seconds'), 30),
    cm.pos_require_auth = COALESCE(JSON_EXTRACT(cm.config_json, '$.require_auth'), 1),
    cm.pos_allow_discount_after_tax = COALESCE(JSON_EXTRACT(cm.config_json, '$.allow_discount_after_tax'), 0),
    cm.pos_tip_adjustment_enabled = COALESCE(JSON_EXTRACT(cm.config_json, '$.tip_adjustment_enabled'), 0)
WHERE cm.config_json IS NOT NULL 
  AND m.code = 'pos';

-- Parse config_json for Inventory module settings
UPDATE company_modules cm
INNER JOIN modules m ON m.id = cm.module_id
SET 
    cm.inventory_enabled = COALESCE(cm.inventory_enabled, 1),
    cm.inventory_multi_warehouse = COALESCE(JSON_EXTRACT(cm.config_json, '$.multi_warehouse'), 0),
    cm.inventory_warehouses = JSON_EXTRACT(cm.config_json, '$.warehouses'),
    cm.inventory_auto_reorder = COALESCE(JSON_EXTRACT(cm.config_json, '$.auto_reorder'), 0),
    cm.inventory_low_stock_threshold = COALESCE(JSON_EXTRACT(cm.config_json, '$.low_stock_threshold'), 10)
WHERE cm.config_json IS NOT NULL 
  AND m.code = 'inventory';

-- Parse config_json for Sales module settings
UPDATE company_modules cm
INNER JOIN modules m ON m.id = cm.module_id
SET 
    cm.sales_enabled = COALESCE(cm.sales_enabled, 1),
    cm.sales_tax_mode = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(cm.config_json, '$.tax_mode')), 'inclusive'),
    cm.sales_allow_partial_pay = COALESCE(JSON_EXTRACT(cm.config_json, '$.allow_partial_pay'), 1),
    cm.sales_credit_limit_enabled = COALESCE(JSON_EXTRACT(cm.config_json, '$.credit_limit_enabled'), 0)
WHERE cm.config_json IS NOT NULL 
  AND m.code = 'sales';

-- Parse config_json for Purchasing module settings
UPDATE company_modules cm
INNER JOIN modules m ON m.id = cm.module_id
SET 
    cm.purchasing_enabled = COALESCE(cm.purchasing_enabled, 0),
    cm.purchasing_approval_workflow = COALESCE(JSON_EXTRACT(cm.config_json, '$.approval_workflow'), 0),
    cm.purchasing_credit_limit_enabled = COALESCE(JSON_EXTRACT(cm.config_json, '$.credit_limit_enabled'), 0)
WHERE cm.config_json IS NOT NULL 
  AND m.code = 'purchasing';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
