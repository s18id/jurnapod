-- Migration: 0196_reservations_canonical_ts_hard_cutover.sql
-- Purpose: Backfill canonical reservation timestamps and enforce NOT NULL constraints
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Rerunnable/Idempotent: yes (guarded by information_schema checks)

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- -----------------------------------------------------------------------------
-- Step 0: Ensure table exists
-- -----------------------------------------------------------------------------
SET @reservations_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
);

-- -----------------------------------------------------------------------------
-- Step 1: Backfill reservation_start_ts from reservation_at where missing
-- -----------------------------------------------------------------------------
SET @sql_backfill_start = IF(
  @reservations_exists = 1,
  'UPDATE reservations
     SET reservation_start_ts = UNIX_TIMESTAMP(reservation_at) * 1000
   WHERE reservation_start_ts IS NULL
     AND reservation_at IS NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_backfill_start;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- Step 2: Backfill reservation_end_ts from reservation_start_ts + duration
-- -----------------------------------------------------------------------------
SET @sql_backfill_end = IF(
  @reservations_exists = 1,
  'UPDATE reservations
     SET reservation_end_ts = reservation_start_ts + (COALESCE(duration_minutes, 90) * 60000)
   WHERE reservation_end_ts IS NULL
     AND reservation_start_ts IS NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_backfill_end;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- Step 3: Count unresolved canonical timestamp gaps
-- -----------------------------------------------------------------------------
SET @start_null_count = IF(
  @reservations_exists = 1,
  (SELECT COUNT(*) FROM reservations WHERE reservation_start_ts IS NULL),
  0
);

SET @end_null_count = IF(
  @reservations_exists = 1,
  (SELECT COUNT(*) FROM reservations WHERE reservation_end_ts IS NULL),
  0
);

-- -----------------------------------------------------------------------------
-- Step 4: Make reservation_at nullable (compatibility column, derived output)
-- -----------------------------------------------------------------------------
SET @reservation_at_not_nullable = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'reservation_at'
    AND IS_NULLABLE = 'NO'
);

SET @sql_make_reservation_at_nullable = IF(
  @reservations_exists = 1 AND @reservation_at_not_nullable = 1,
  'ALTER TABLE reservations MODIFY COLUMN reservation_at DATETIME NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_make_reservation_at_nullable;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- Step 5: Enforce reservation_start_ts NOT NULL (only when fully backfilled)
-- -----------------------------------------------------------------------------
SET @start_is_nullable = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'reservation_start_ts'
    AND IS_NULLABLE = 'YES'
);

SET @sql_enforce_start_not_null = IF(
  @reservations_exists = 1 AND @start_is_nullable = 1 AND @start_null_count = 0,
  'ALTER TABLE reservations MODIFY COLUMN reservation_start_ts BIGINT NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_enforce_start_not_null;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- Step 6: Enforce reservation_end_ts NOT NULL (only when fully backfilled)
-- -----------------------------------------------------------------------------
SET @end_is_nullable = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND COLUMN_NAME = 'reservation_end_ts'
    AND IS_NULLABLE = 'YES'
);

SET @sql_enforce_end_not_null = IF(
  @reservations_exists = 1 AND @end_is_nullable = 1 AND @end_null_count = 0,
  'ALTER TABLE reservations MODIFY COLUMN reservation_end_ts BIGINT NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql_enforce_end_not_null;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------------------------
-- Step 7: Verification output
-- -----------------------------------------------------------------------------
SELECT
  @start_null_count AS reservation_start_ts_null_count,
  @end_null_count AS reservation_end_ts_null_count;

SELECT
  COLUMN_NAME,
  IS_NULLABLE,
  COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reservations'
  AND COLUMN_NAME IN ('reservation_at', 'reservation_start_ts', 'reservation_end_ts')
ORDER BY FIELD(COLUMN_NAME, 'reservation_at', 'reservation_start_ts', 'reservation_end_ts');

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
