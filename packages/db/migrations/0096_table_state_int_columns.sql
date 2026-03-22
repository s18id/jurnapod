-- Migration: 0096_table_state_int_columns.sql
-- Purpose: Introduce canonical integer status columns on existing table/reservation entities
-- Author: BMAD AI Agent (Winston/Architect)
-- Date: 2026-03-18
-- Compatibility: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;

-- ---------------------------------------------------------------------------
-- outlet_tables.status_id (canonical int status)
-- ---------------------------------------------------------------------------
SET @outlet_tables_has_status_id = (
  SELECT COUNT(*) > 0
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlet_tables'
    AND COLUMN_NAME = 'status_id'
);

SET @sql = IF(
  @outlet_tables_has_status_id = 1,
  'SELECT ''outlet_tables.status_id already exists'' AS status',
  'ALTER TABLE outlet_tables ADD COLUMN status_id TINYINT UNSIGNED NULL AFTER status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE outlet_tables
SET status_id = CASE UPPER(COALESCE(status, 'AVAILABLE'))
  WHEN 'AVAILABLE' THEN 1
  WHEN 'RESERVED' THEN 2
  WHEN 'OCCUPIED' THEN 5
  WHEN 'UNAVAILABLE' THEN 7
  ELSE 1
END
WHERE status_id IS NULL;

SET @outlet_tables_status_id_idx_exists = (
  SELECT COUNT(*) > 0
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlet_tables'
    AND INDEX_NAME = 'idx_outlet_tables_company_outlet_status_id'
);

SET @sql = IF(
  @outlet_tables_status_id_idx_exists = 1,
  'SELECT ''idx_outlet_tables_company_outlet_status_id already exists'' AS status',
  'ALTER TABLE outlet_tables ADD INDEX idx_outlet_tables_company_outlet_status_id (company_id, outlet_id, status_id)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @outlet_tables_has_status_id_after = (
  SELECT COUNT(*) > 0
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlet_tables'
    AND COLUMN_NAME = 'status_id'
);

SET @outlet_tables_status_id_not_null = (
  SELECT COALESCE(MAX(IS_NULLABLE = 'NO'), 0)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'outlet_tables'
    AND COLUMN_NAME = 'status_id'
);

SET @sql = IF(
  @outlet_tables_has_status_id_after = 0 OR @outlet_tables_status_id_not_null = 1,
  'SELECT ''outlet_tables.status_id not-null already satisfied or column missing'' AS status',
  'ALTER TABLE outlet_tables MODIFY COLUMN status_id TINYINT UNSIGNED NOT NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- reservations.status_id (canonical int status)
-- ---------------------------------------------------------------------------
SET @reservations_has_status_id = (
  SELECT COUNT(*) > 0
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'status_id'
);

SET @sql = IF(
  @reservations_has_status_id = 1,
  'SELECT ''reservations.status_id already exists'' AS status',
  'ALTER TABLE reservations ADD COLUMN status_id TINYINT UNSIGNED NULL AFTER status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE reservations
SET status_id = CASE UPPER(COALESCE(status, 'BOOKED'))
  WHEN 'BOOKED' THEN 1
  WHEN 'CONFIRMED' THEN 2
  WHEN 'ARRIVED' THEN 3
  WHEN 'SEATED' THEN 4
  WHEN 'COMPLETED' THEN 6
  WHEN 'CANCELLED' THEN 5
  WHEN 'NO_SHOW' THEN 7
  ELSE 1
END
WHERE status_id IS NULL;

SET @reservations_status_id_idx_exists = (
  SELECT COUNT(*) > 0
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND INDEX_NAME = 'idx_reservations_company_outlet_status_id'
);

SET @sql = IF(
  @reservations_status_id_idx_exists = 1,
  'SELECT ''idx_reservations_company_outlet_status_id already exists'' AS status',
  'ALTER TABLE reservations ADD INDEX idx_reservations_company_outlet_status_id (company_id, outlet_id, status_id)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @reservations_has_status_id_after = (
  SELECT COUNT(*) > 0
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'status_id'
);

SET @reservations_status_id_not_null = (
  SELECT COALESCE(MAX(IS_NULLABLE = 'NO'), 0)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'status_id'
);

SET @sql = IF(
  @reservations_has_status_id_after = 0 OR @reservations_status_id_not_null = 1,
  'SELECT ''reservations.status_id not-null already satisfied or column missing'' AS status',
  'ALTER TABLE reservations MODIFY COLUMN status_id TINYINT UNSIGNED NOT NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
