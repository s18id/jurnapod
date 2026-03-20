-- Migration: 0112_add_reservation_group_id.sql
-- Purpose: Add reservation_group_id FK column + indexes for multi-table groups
-- Author: BMAD AI Agent
-- Date: 2026-03-20
--
-- RERUNNABLE/IDEMPOTENT: Uses information_schema checks + dynamic ALTER TABLE.
-- Compatible with MySQL 8.0+ and MariaDB.

SET FOREIGN_KEY_CHECKS=0;

-- Step 1: Check if reservations table exists
SELECT COUNT(*) INTO @reservations_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reservations';

-- Step 2: Add reservation_group_id column (if not exists)
SELECT COUNT(*) INTO @col_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reservations'
  AND COLUMN_NAME = 'reservation_group_id';

SET @add_col = IF(
  @reservations_exists = 1 AND @col_exists = 0,
  'ALTER TABLE reservations ADD COLUMN reservation_group_id BIGINT UNSIGNED NULL COMMENT ''Links reservation to a group for multi-table parties'' AFTER outlet_id',
  'SELECT ''reservations.reservation_group_id already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: Add index on reservation_group_id (if not exists)
SELECT COUNT(*) INTO @idx_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reservations'
  AND INDEX_NAME = 'idx_reservation_group';

SET @add_idx = IF(
  @reservations_exists = 1 AND @idx_exists = 0,
  'ALTER TABLE reservations ADD INDEX idx_reservation_group (reservation_group_id)',
  'SELECT ''idx_reservation_group already exists'' AS msg;'
);

PREPARE stmt FROM @add_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 4: Add composite index for group lookups (if not exists)
SELECT COUNT(*) INTO @idx_comp_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reservations'
  AND INDEX_NAME = 'idx_group_reservations';

SET @add_idx_comp = IF(
  @reservations_exists = 1 AND @idx_comp_exists = 0,
  'ALTER TABLE reservations ADD INDEX idx_group_reservations (company_id, outlet_id, reservation_group_id)',
  'SELECT ''idx_group_reservations already exists'' AS msg;'
);

PREPARE stmt FROM @add_idx_comp;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 5: Add FK constraint (if not exists)
-- Check via TABLE_CONSTRAINTS for the constraint name
SELECT COUNT(*) INTO @fk_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reservations'
  AND CONSTRAINT_NAME = 'fk_reservations_group';

SET @add_fk = IF(
  @reservations_exists = 1 AND @fk_exists = 0,
  'ALTER TABLE reservations ADD CONSTRAINT fk_reservations_group FOREIGN KEY (reservation_group_id) REFERENCES reservation_groups(id) ON DELETE SET NULL',
  'SELECT ''fk_reservations_group already exists'' AS msg;'
);

PREPARE stmt FROM @add_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verification
SELECT 'reservations.group_id migration' AS check_name,
       SUM(CASE WHEN c.COLUMN_NAME = 'reservation_group_id' THEN 1 ELSE 0 END) AS has_col,
       SUM(CASE WHEN s.INDEX_NAME = 'idx_reservation_group' THEN 1 ELSE 0 END) AS has_idx_simple,
       SUM(CASE WHEN sc.INDEX_NAME = 'idx_group_reservations' THEN 1 ELSE 0 END) AS has_idx_comp,
       SUM(CASE WHEN tc.CONSTRAINT_NAME = 'fk_reservations_group' THEN 1 ELSE 0 END) AS has_fk
FROM information_schema.COLUMNS c
LEFT JOIN information_schema.STATISTICS s ON c.TABLE_SCHEMA = s.TABLE_SCHEMA
  AND c.TABLE_NAME = s.TABLE_NAME AND s.INDEX_NAME = 'idx_reservation_group'
LEFT JOIN information_schema.STATISTICS sc ON c.TABLE_SCHEMA = sc.TABLE_SCHEMA
  AND c.TABLE_NAME = sc.TABLE_NAME AND sc.INDEX_NAME = 'idx_group_reservations'
LEFT JOIN information_schema.TABLE_CONSTRAINTS tc ON c.TABLE_SCHEMA = tc.TABLE_SCHEMA
  AND c.TABLE_NAME = tc.TABLE_NAME AND tc.CONSTRAINT_NAME = 'fk_reservations_group'
WHERE c.TABLE_SCHEMA = DATABASE()
  AND c.TABLE_NAME = 'reservations'
  AND c.COLUMN_NAME = 'reservation_group_id';

SET FOREIGN_KEY_CHECKS=1;
