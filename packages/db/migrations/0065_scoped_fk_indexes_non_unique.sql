-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

SET @idx_outlet_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlet_tables'
    AND INDEX_NAME = 'idx_outlet_tables_company_outlet_id'
);

SET @add_idx_outlet_sql := IF(
  @idx_outlet_exists = 0,
  'ALTER TABLE outlet_tables ADD KEY idx_outlet_tables_company_outlet_id (company_id, outlet_id, id)',
  'SELECT 1'
);

PREPARE stmt FROM @add_idx_outlet_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @uq_outlet_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlet_tables'
    AND INDEX_NAME = 'uq_outlet_tables_company_outlet_id'
);

SET @drop_uq_outlet_sql := IF(
  @uq_outlet_exists > 0,
  'ALTER TABLE outlet_tables DROP INDEX uq_outlet_tables_company_outlet_id',
  'SELECT 1'
);

PREPARE stmt FROM @drop_uq_outlet_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_reservation_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND INDEX_NAME = 'idx_reservations_company_outlet_id'
);

SET @add_idx_reservation_sql := IF(
  @idx_reservation_exists = 0,
  'ALTER TABLE reservations ADD KEY idx_reservations_company_outlet_id (company_id, outlet_id, id)',
  'SELECT 1'
);

PREPARE stmt FROM @add_idx_reservation_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @uq_reservation_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND INDEX_NAME = 'uq_reservations_company_outlet_id'
);

SET @drop_uq_reservation_sql := IF(
  @uq_reservation_exists > 0,
  'ALTER TABLE reservations DROP INDEX uq_reservations_company_outlet_id',
  'SELECT 1'
);

PREPARE stmt FROM @drop_uq_reservation_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
