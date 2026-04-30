-- Migration: 0198_ap_idempotency_keys.sql
-- Purpose: Add AP idempotency keys across purchasing document tables
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Rerunnable/Idempotent: yes (guarded via information_schema)

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- -----------------------------------------------------------------------------
-- purchase_orders: add idempotency_key + unique(company_id, idempotency_key)
-- -----------------------------------------------------------------------------
SET @po_table_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'purchase_orders'
);

SET @po_idem_col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'purchase_orders'
    AND COLUMN_NAME = 'idempotency_key'
);

SET @sql_add_po_idem_col = IF(
  @po_table_exists = 1 AND @po_idem_col_exists = 0,
  'ALTER TABLE purchase_orders ADD COLUMN idempotency_key VARCHAR(64) NULL AFTER company_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql_add_po_idem_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @po_idem_idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'purchase_orders'
    AND INDEX_NAME = 'uk_purchase_orders_company_idempotency_key'
);

SET @sql_add_po_idem_idx = IF(
  @po_table_exists = 1 AND @po_idem_idx_exists = 0,
  'ALTER TABLE purchase_orders ADD UNIQUE INDEX uk_purchase_orders_company_idempotency_key (company_id, idempotency_key)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_add_po_idem_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- goods_receipts: add idempotency_key + unique(company_id, idempotency_key)
-- -----------------------------------------------------------------------------
SET @gr_table_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'goods_receipts'
);

SET @gr_idem_col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'goods_receipts'
    AND COLUMN_NAME = 'idempotency_key'
);

SET @sql_add_gr_idem_col = IF(
  @gr_table_exists = 1 AND @gr_idem_col_exists = 0,
  'ALTER TABLE goods_receipts ADD COLUMN idempotency_key VARCHAR(64) NULL AFTER company_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql_add_gr_idem_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @gr_idem_idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'goods_receipts'
    AND INDEX_NAME = 'uk_goods_receipts_company_idempotency_key'
);

SET @sql_add_gr_idem_idx = IF(
  @gr_table_exists = 1 AND @gr_idem_idx_exists = 0,
  'ALTER TABLE goods_receipts ADD UNIQUE INDEX uk_goods_receipts_company_idempotency_key (company_id, idempotency_key)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_add_gr_idem_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- purchase_invoices: add idempotency_key + unique(company_id, idempotency_key)
-- -----------------------------------------------------------------------------
SET @pi_table_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'purchase_invoices'
);

SET @pi_idem_col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'purchase_invoices'
    AND COLUMN_NAME = 'idempotency_key'
);

SET @sql_add_pi_idem_col = IF(
  @pi_table_exists = 1 AND @pi_idem_col_exists = 0,
  'ALTER TABLE purchase_invoices ADD COLUMN idempotency_key VARCHAR(64) NULL AFTER company_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql_add_pi_idem_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @pi_idem_idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'purchase_invoices'
    AND INDEX_NAME = 'uk_purchase_invoices_company_idempotency_key'
);

SET @sql_add_pi_idem_idx = IF(
  @pi_table_exists = 1 AND @pi_idem_idx_exists = 0,
  'ALTER TABLE purchase_invoices ADD UNIQUE INDEX uk_purchase_invoices_company_idempotency_key (company_id, idempotency_key)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_add_pi_idem_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- ap_payments: add idempotency_key + unique(company_id, idempotency_key)
-- -----------------------------------------------------------------------------
SET @ap_table_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ap_payments'
);

SET @ap_idem_col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ap_payments'
    AND COLUMN_NAME = 'idempotency_key'
);

SET @sql_add_ap_idem_col = IF(
  @ap_table_exists = 1 AND @ap_idem_col_exists = 0,
  'ALTER TABLE ap_payments ADD COLUMN idempotency_key VARCHAR(64) NULL AFTER company_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql_add_ap_idem_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ap_idem_idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ap_payments'
    AND INDEX_NAME = 'uk_ap_payments_company_idempotency_key'
);

SET @sql_add_ap_idem_idx = IF(
  @ap_table_exists = 1 AND @ap_idem_idx_exists = 0,
  'ALTER TABLE ap_payments ADD UNIQUE INDEX uk_ap_payments_company_idempotency_key (company_id, idempotency_key)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_add_ap_idem_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- purchase_credits: add idempotency_key + unique(company_id, idempotency_key)
-- -----------------------------------------------------------------------------
SET @pc_table_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'purchase_credits'
);

SET @pc_idem_col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'purchase_credits'
    AND COLUMN_NAME = 'idempotency_key'
);

SET @sql_add_pc_idem_col = IF(
  @pc_table_exists = 1 AND @pc_idem_col_exists = 0,
  'ALTER TABLE purchase_credits ADD COLUMN idempotency_key VARCHAR(64) NULL AFTER company_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql_add_pc_idem_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @pc_idem_idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'purchase_credits'
    AND INDEX_NAME = 'uk_purchase_credits_company_idempotency_key'
);

SET @sql_add_pc_idem_idx = IF(
  @pc_table_exists = 1 AND @pc_idem_idx_exists = 0,
  'ALTER TABLE purchase_credits ADD UNIQUE INDEX uk_purchase_credits_company_idempotency_key (company_id, idempotency_key)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_add_pc_idem_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- Verification output
-- -----------------------------------------------------------------------------
SELECT
  TABLE_NAME,
  COLUMN_NAME,
  IS_NULLABLE,
  COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('purchase_orders', 'goods_receipts', 'purchase_invoices', 'ap_payments', 'purchase_credits')
  AND COLUMN_NAME = 'idempotency_key'
ORDER BY TABLE_NAME;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
