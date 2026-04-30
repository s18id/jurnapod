-- Migration: 0199_goods_receipts_idempotency_warnings_json.sql
-- Purpose: Persist goods-receipt idempotency warnings for deterministic replay
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Rerunnable/Idempotent: yes (guarded via information_schema)

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- -----------------------------------------------------------------------------
-- Step 0: Ensure goods_receipts table exists
-- -----------------------------------------------------------------------------
SET @gr_table_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'goods_receipts'
);

-- -----------------------------------------------------------------------------
-- Step 1: Add idempotency_warnings_json if missing
-- -----------------------------------------------------------------------------
SET @gr_warnings_col_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'goods_receipts'
    AND COLUMN_NAME = 'idempotency_warnings_json'
);

SET @sql_add_gr_warnings_col = IF(
  @gr_table_exists = 1 AND @gr_warnings_col_exists = 0,
  'ALTER TABLE goods_receipts ADD COLUMN idempotency_warnings_json LONGTEXT NULL AFTER idempotency_key',
  'SELECT 1'
);
PREPARE stmt FROM @sql_add_gr_warnings_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- Step 2: Backfill existing rows to deterministic empty warnings payload
-- -----------------------------------------------------------------------------
SET @sql_backfill_gr_warnings = IF(
  @gr_table_exists = 1,
  'UPDATE goods_receipts
     SET idempotency_warnings_json = ''[]''
   WHERE idempotency_warnings_json IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_backfill_gr_warnings;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- Verification output
-- -----------------------------------------------------------------------------
SELECT
  COLUMN_NAME,
  IS_NULLABLE,
  COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'goods_receipts'
  AND COLUMN_NAME IN ('idempotency_key', 'idempotency_warnings_json')
ORDER BY FIELD(COLUMN_NAME, 'idempotency_key', 'idempotency_warnings_json');

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
