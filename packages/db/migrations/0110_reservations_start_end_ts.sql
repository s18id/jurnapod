-- Migration: 0110_reservations_start_end_ts.sql
-- Purpose: Add canonical reservation start/end unix timestamp columns and indexes
-- Author: BMAD AI Agent
-- Date: 2026-03-20
--
-- RERUNNABLE/IDEMPOTENT: Uses information_schema checks + dynamic ALTER TABLE.

SET FOREIGN_KEY_CHECKS=0;

SELECT COUNT(*) INTO @reservations_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reservations';

-- Step 1: Add reservation_start_ts (BIGINT NULL)
SELECT COUNT(*) INTO @reservation_start_ts_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reservations'
  AND COLUMN_NAME = 'reservation_start_ts';

SET @add_reservation_start_ts = IF(
  @reservations_exists = 1 AND @reservation_start_ts_exists = 0,
  'ALTER TABLE reservations ADD COLUMN reservation_start_ts BIGINT NULL AFTER reservation_at',
  'SELECT ''reservations.reservation_start_ts already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_reservation_start_ts;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: Add reservation_end_ts (BIGINT NULL)
SELECT COUNT(*) INTO @reservation_end_ts_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reservations'
  AND COLUMN_NAME = 'reservation_end_ts';

SET @add_reservation_end_ts = IF(
  @reservations_exists = 1 AND @reservation_end_ts_exists = 0,
  'ALTER TABLE reservations ADD COLUMN reservation_end_ts BIGINT NULL AFTER reservation_start_ts',
  'SELECT ''reservations.reservation_end_ts already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_reservation_end_ts;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: Add reporting/list index
SELECT COUNT(*) INTO @idx_scope_start_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reservations'
  AND INDEX_NAME = 'idx_reservations_company_outlet_start_ts';

SET @add_idx_scope_start = IF(
  @reservations_exists = 1 AND @idx_scope_start_exists = 0,
  'ALTER TABLE reservations ADD INDEX idx_reservations_company_outlet_start_ts (company_id, outlet_id, reservation_start_ts, id)',
  'SELECT ''idx_reservations_company_outlet_start_ts already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_idx_scope_start;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 4: Add overlap/window index
SELECT COUNT(*) INTO @idx_scope_window_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reservations'
  AND INDEX_NAME = 'idx_reservations_scope_table_window_ts';

SET @add_idx_scope_window = IF(
  @reservations_exists = 1 AND @idx_scope_window_exists = 0,
  'ALTER TABLE reservations ADD INDEX idx_reservations_scope_table_window_ts (company_id, outlet_id, table_id, reservation_start_ts, reservation_end_ts, status)',
  'SELECT ''idx_reservations_scope_table_window_ts already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_idx_scope_window;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verification
SELECT 'reservations canonical ts columns' AS check_name,
       SUM(CASE WHEN COLUMN_NAME = 'reservation_start_ts' THEN 1 ELSE 0 END) AS has_reservation_start_ts,
       SUM(CASE WHEN COLUMN_NAME = 'reservation_end_ts' THEN 1 ELSE 0 END) AS has_reservation_end_ts
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reservations'
  AND COLUMN_NAME IN ('reservation_start_ts', 'reservation_end_ts');

SELECT 'reservations canonical ts indexes' AS check_name,
       SUM(CASE WHEN INDEX_NAME = 'idx_reservations_company_outlet_start_ts' THEN 1 ELSE 0 END) AS has_idx_company_outlet_start_ts,
       SUM(CASE WHEN INDEX_NAME = 'idx_reservations_scope_table_window_ts' THEN 1 ELSE 0 END) AS has_idx_scope_table_window_ts
FROM (
  SELECT DISTINCT INDEX_NAME
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND INDEX_NAME IN (
      'idx_reservations_company_outlet_start_ts',
      'idx_reservations_scope_table_window_ts'
    )
) idx;

SET FOREIGN_KEY_CHECKS=1;
