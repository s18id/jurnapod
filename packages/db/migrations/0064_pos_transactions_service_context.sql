-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

SET @service_type_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND COLUMN_NAME = 'service_type'
);

SET @add_service_type_sql := IF(
  @service_type_exists = 0,
  "ALTER TABLE pos_transactions ADD COLUMN service_type VARCHAR(16) NOT NULL DEFAULT 'TAKEAWAY'",
  'SELECT 1'
);

PREPARE stmt FROM @add_service_type_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @table_id_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND COLUMN_NAME = 'table_id'
);

SET @add_table_id_sql := IF(
  @table_id_exists = 0,
  'ALTER TABLE pos_transactions ADD COLUMN table_id BIGINT UNSIGNED NULL',
  'SELECT 1'
);

PREPARE stmt FROM @add_table_id_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @reservation_id_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND COLUMN_NAME = 'reservation_id'
);

SET @add_reservation_id_sql := IF(
  @reservation_id_exists = 0,
  'ALTER TABLE pos_transactions ADD COLUMN reservation_id BIGINT UNSIGNED NULL',
  'SELECT 1'
);

PREPARE stmt FROM @add_reservation_id_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @guest_count_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND COLUMN_NAME = 'guest_count'
);

SET @add_guest_count_sql := IF(
  @guest_count_exists = 0,
  'ALTER TABLE pos_transactions ADD COLUMN guest_count INT UNSIGNED NULL',
  'SELECT 1'
);

PREPARE stmt FROM @add_guest_count_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_status_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND COLUMN_NAME = 'order_status'
);

SET @add_order_status_sql := IF(
  @order_status_exists = 0,
  "ALTER TABLE pos_transactions ADD COLUMN order_status VARCHAR(16) NOT NULL DEFAULT 'COMPLETED'",
  'SELECT 1'
);

PREPARE stmt FROM @add_order_status_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @opened_at_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND COLUMN_NAME = 'opened_at'
);

SET @add_opened_at_sql := IF(
  @opened_at_exists = 0,
  'ALTER TABLE pos_transactions ADD COLUMN opened_at DATETIME NULL',
  'SELECT 1'
);

PREPARE stmt FROM @add_opened_at_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @closed_at_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND COLUMN_NAME = 'closed_at'
);

SET @add_closed_at_sql := IF(
  @closed_at_exists = 0,
  'ALTER TABLE pos_transactions ADD COLUMN closed_at DATETIME NULL',
  'SELECT 1'
);

PREPARE stmt FROM @add_closed_at_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @notes_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND COLUMN_NAME = 'notes'
);

SET @add_notes_sql := IF(
  @notes_exists = 0,
  'ALTER TABLE pos_transactions ADD COLUMN notes VARCHAR(500) NULL',
  'SELECT 1'
);

PREPARE stmt FROM @add_notes_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_service_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND INDEX_NAME = 'idx_pos_transactions_company_outlet_service'
);

SET @add_idx_service_sql := IF(
  @idx_service_exists = 0,
  'ALTER TABLE pos_transactions ADD KEY idx_pos_transactions_company_outlet_service (company_id, outlet_id, service_type, trx_at, id)',
  'SELECT 1'
);

PREPARE stmt FROM @add_idx_service_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_reservation_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND INDEX_NAME = 'idx_pos_transactions_company_outlet_reservation'
);

SET @add_idx_reservation_sql := IF(
  @idx_reservation_exists = 0,
  'ALTER TABLE pos_transactions ADD KEY idx_pos_transactions_company_outlet_reservation (company_id, outlet_id, reservation_id)',
  'SELECT 1'
);

PREPARE stmt FROM @add_idx_reservation_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_table_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND INDEX_NAME = 'idx_pos_transactions_company_outlet_table'
);

SET @add_idx_table_sql := IF(
  @idx_table_exists = 0,
  'ALTER TABLE pos_transactions ADD KEY idx_pos_transactions_company_outlet_table (company_id, outlet_id, table_id)',
  'SELECT 1'
);

PREPARE stmt FROM @add_idx_table_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @outlet_tables_scoped_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlet_tables'
    AND INDEX_NAME IN ('idx_outlet_tables_company_outlet_id', 'uq_outlet_tables_company_outlet_id')
);

SET @ensure_outlet_tables_scoped_index_sql := IF(
  @outlet_tables_scoped_index_exists = 0,
  'ALTER TABLE outlet_tables ADD KEY idx_outlet_tables_company_outlet_id (company_id, outlet_id, id)',
  'SELECT 1'
);

PREPARE stmt FROM @ensure_outlet_tables_scoped_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @reservations_scoped_index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND INDEX_NAME IN ('idx_reservations_company_outlet_id', 'uq_reservations_company_outlet_id')
);

SET @ensure_reservations_scoped_index_sql := IF(
  @reservations_scoped_index_exists = 0,
  'ALTER TABLE reservations ADD KEY idx_reservations_company_outlet_id (company_id, outlet_id, id)',
  'SELECT 1'
);

PREPARE stmt FROM @ensure_reservations_scoped_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @chk_service_type_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND CONSTRAINT_TYPE = 'CHECK'
    AND CONSTRAINT_NAME = 'chk_pos_transactions_service_type'
);

SET @add_chk_service_type_sql := IF(
  @chk_service_type_exists = 0,
  "ALTER TABLE pos_transactions ADD CONSTRAINT chk_pos_transactions_service_type CHECK (service_type IN ('TAKEAWAY', 'DINE_IN'))",
  'SELECT 1'
);

PREPARE stmt FROM @add_chk_service_type_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @chk_order_status_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND CONSTRAINT_TYPE = 'CHECK'
    AND CONSTRAINT_NAME = 'chk_pos_transactions_order_status'
);

SET @add_chk_order_status_sql := IF(
  @chk_order_status_exists = 0,
  "ALTER TABLE pos_transactions ADD CONSTRAINT chk_pos_transactions_order_status CHECK (order_status IN ('OPEN', 'READY_TO_PAY', 'COMPLETED', 'CANCELLED'))",
  'SELECT 1'
);

PREPARE stmt FROM @add_chk_order_status_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_table_scoped_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND CONSTRAINT_NAME = 'fk_pos_transactions_table_scoped'
);

SET @add_fk_table_scoped_sql := IF(
  @fk_table_scoped_exists = 0,
  'ALTER TABLE pos_transactions ADD CONSTRAINT fk_pos_transactions_table_scoped FOREIGN KEY (company_id, outlet_id, table_id) REFERENCES outlet_tables(company_id, outlet_id, id)',
  'SELECT 1'
);

PREPARE stmt FROM @add_fk_table_scoped_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_reservation_scoped_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_transactions'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND CONSTRAINT_NAME = 'fk_pos_transactions_reservation_scoped'
);

SET @add_fk_reservation_scoped_sql := IF(
  @fk_reservation_scoped_exists = 0,
  'ALTER TABLE pos_transactions ADD CONSTRAINT fk_pos_transactions_reservation_scoped FOREIGN KEY (company_id, outlet_id, reservation_id) REFERENCES reservations(company_id, outlet_id, id)',
  'SELECT 1'
);

PREPARE stmt FROM @add_fk_reservation_scoped_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE pos_transactions
SET service_type = COALESCE(service_type, 'TAKEAWAY'),
    order_status = COALESCE(order_status, 'COMPLETED'),
    opened_at = COALESCE(opened_at, trx_at),
    closed_at = COALESCE(closed_at, trx_at)
WHERE service_type IS NULL
   OR order_status IS NULL
   OR opened_at IS NULL
   OR closed_at IS NULL;
