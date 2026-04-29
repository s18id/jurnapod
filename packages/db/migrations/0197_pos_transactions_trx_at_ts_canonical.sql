-- Migration: 0197_pos_transactions_trx_at_ts_canonical.sql
-- Purpose: Add canonical BIGINT unix ms timestamp for pos_transactions
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Rerunnable/Idempotent: yes (guarded via information_schema)

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- -----------------------------------------------------------------------------
-- Step 0: Ensure table exists
-- -----------------------------------------------------------------------------
SET @pos_transactions_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
);

-- -----------------------------------------------------------------------------
-- Step 1: Add trx_at_ts BIGINT (canonical) if missing
-- -----------------------------------------------------------------------------
SET @trx_at_ts_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND COLUMN_NAME = 'trx_at_ts'
);

SET @sql_add_trx_at_ts = IF(
  @pos_transactions_exists = 1 AND @trx_at_ts_exists = 0,
  'ALTER TABLE pos_transactions ADD COLUMN trx_at_ts BIGINT NULL AFTER trx_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql_add_trx_at_ts;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- Step 2: Backfill trx_at_ts from trx_at where missing
-- -----------------------------------------------------------------------------
SET @sql_backfill_trx_at_ts = IF(
  @pos_transactions_exists = 1,
  'UPDATE pos_transactions
     SET trx_at_ts = UNIX_TIMESTAMP(trx_at) * 1000
   WHERE trx_at_ts IS NULL
     AND trx_at IS NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_backfill_trx_at_ts;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- Step 3: Add canonical index for scoped time-range queries
-- -----------------------------------------------------------------------------
SET @trx_at_ts_idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND INDEX_NAME = 'idx_pos_transactions_company_outlet_trx_at_ts'
);

SET @sql_add_trx_at_ts_idx = IF(
  @pos_transactions_exists = 1 AND @trx_at_ts_idx_exists = 0,
  'ALTER TABLE pos_transactions ADD INDEX idx_pos_transactions_company_outlet_trx_at_ts (company_id, outlet_id, trx_at_ts)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_add_trx_at_ts_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- Step 4: Enforce NOT NULL only when backfill is complete
-- -----------------------------------------------------------------------------
SET @trx_at_ts_null_count = IF(
  @pos_transactions_exists = 1,
  (SELECT COUNT(*) FROM pos_transactions WHERE trx_at_ts IS NULL),
  0
);

SET @trx_at_ts_is_nullable = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND COLUMN_NAME = 'trx_at_ts'
    AND IS_NULLABLE = 'YES'
);

SET @sql_enforce_trx_at_ts_not_null = IF(
  @pos_transactions_exists = 1 AND @trx_at_ts_is_nullable = 1 AND @trx_at_ts_null_count = 0,
  'ALTER TABLE pos_transactions MODIFY COLUMN trx_at_ts BIGINT NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_enforce_trx_at_ts_not_null;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- Step 5: Verification output
-- -----------------------------------------------------------------------------
SELECT @trx_at_ts_null_count AS trx_at_ts_null_count;

SELECT
  COLUMN_NAME,
  IS_NULLABLE,
  COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'pos_transactions'
  AND COLUMN_NAME IN ('trx_at', 'trx_at_ts')
ORDER BY FIELD(COLUMN_NAME, 'trx_at', 'trx_at_ts');

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
