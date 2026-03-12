-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Scope: Make client_tx_id unique per company (tenant-scoped idempotency)
-- Before: UNIQUE KEY uq_pos_transactions_client_tx_id (client_tx_id)
-- After:  UNIQUE KEY uq_pos_transactions_client_tx_id (company_id, client_tx_id)

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND INDEX_NAME = 'uq_pos_transactions_client_tx_id'
    AND NON_UNIQUE = 0
);

SET @idx_company_first := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND INDEX_NAME = 'uq_pos_transactions_client_tx_id'
    AND SEQ_IN_INDEX = 1
    AND COLUMN_NAME = 'company_id'
);

SET @idx_client_second := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND INDEX_NAME = 'uq_pos_transactions_client_tx_id'
    AND SEQ_IN_INDEX = 2
    AND COLUMN_NAME = 'client_tx_id'
);

SET @idx_col_count := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND INDEX_NAME = 'uq_pos_transactions_client_tx_id'
);

SET @idx_is_tenant_scoped := IF(
  @idx_company_first = 1 AND @idx_client_second = 1 AND @idx_col_count = 2,
  1,
  0
);

SET @needs_reshape := IF(
  @idx_exists > 0 AND @idx_is_tenant_scoped = 0,
  1,
  0
);

SET @needs_add := IF(
  @idx_exists = 0,
  1,
  0
);

SET @reshape_sql := IF(
  @needs_reshape = 1,
  'ALTER TABLE pos_transactions DROP INDEX uq_pos_transactions_client_tx_id, ADD UNIQUE KEY uq_pos_transactions_client_tx_id (company_id, client_tx_id)',
  'SELECT 1'
);

SET @add_sql := IF(
  @needs_add = 1,
  'ALTER TABLE pos_transactions ADD UNIQUE KEY uq_pos_transactions_client_tx_id (company_id, client_tx_id)',
  'SELECT 1'
);

PREPARE reshape_stmt FROM @reshape_sql;
EXECUTE reshape_stmt;
DEALLOCATE PREPARE reshape_stmt;

PREPARE add_stmt FROM @add_sql;
EXECUTE add_stmt;
DEALLOCATE PREPARE add_stmt;
