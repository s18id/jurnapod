-- Migration: 0174_purchase_orders_status_tinyint.sql
-- Convert purchase_orders.status from ENUM to TINYINT
-- Mapping: 1=DRAFT, 2=SENT, 3=PARTIAL_RECEIVED, 4=RECEIVED, 5=CLOSED

-- Step 1: add temporary status_code column if current status is enum and temp column missing
SET @status_data_type = (
  SELECT DATA_TYPE
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'purchase_orders'
    AND column_name = 'status'
  LIMIT 1
);

SET @status_code_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'purchase_orders'
    AND column_name = 'status_code'
);

SET @sql = IF(
  @status_data_type = 'enum' AND @status_code_exists = 0,
  'ALTER TABLE purchase_orders ADD COLUMN status_code TINYINT NOT NULL DEFAULT 1 AFTER order_date',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: backfill temporary status_code from enum status values
SET @status_code_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'purchase_orders'
    AND column_name = 'status_code'
);

SET @sql = IF(
  @status_data_type = 'enum' AND @status_code_exists = 1,
  "UPDATE purchase_orders SET status_code = CASE status WHEN 'DRAFT' THEN 1 WHEN 'SENT' THEN 2 WHEN 'PARTIAL_RECEIVED' THEN 3 WHEN 'RECEIVED' THEN 4 WHEN 'CLOSED' THEN 5 ELSE 1 END",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: drop old status index (if present) before dropping enum status column
SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'purchase_orders'
    AND index_name = 'idx_po_status'
);

SET @sql = IF(
  @status_data_type = 'enum' AND @idx_exists > 0,
  'ALTER TABLE purchase_orders DROP INDEX idx_po_status',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 4: replace enum status column with tinyint status column
SET @status_code_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'purchase_orders'
    AND column_name = 'status_code'
);

SET @sql = IF(
  @status_data_type = 'enum' AND @status_code_exists = 1,
  'ALTER TABLE purchase_orders DROP COLUMN status, CHANGE COLUMN status_code status TINYINT NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 5: ensure status index exists on tinyint status column
SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'purchase_orders'
    AND index_name = 'idx_po_status'
);

SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE purchase_orders ADD INDEX idx_po_status (status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
