-- Migration: 0105_story_12_5_add_session_columns_and_lines_table.sql
-- Purpose: Add missing columns for Story 12.5 Service Session Management
-- Author: BMAD QA Agent
-- Date: 2026-03-19
-- 
-- CRITICAL: This migration is RERUNNABLE and IDEMPOTENT for MySQL 8.0+ and MariaDB 10.2+
-- Adds columns needed by service-sessions.ts library

SET FOREIGN_KEY_CHECKS=0;

-- ============================================================================
-- UPDATE 1: Add missing columns to table_service_sessions
-- ============================================================================

SELECT COUNT(*) INTO @table_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions';

-- Add locked_at column if missing
SELECT COUNT(*) INTO @col_locked_at_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions'
  AND COLUMN_NAME = 'locked_at';

SET @add_locked_at = IF(
  @table_exists = 1 AND @col_locked_at_exists = 0,
  'ALTER TABLE table_service_sessions ADD COLUMN locked_at DATETIME NULL COMMENT "When session was locked for payment" AFTER completed_at',
  'SELECT "locked_at column already exists or table missing" AS msg;'
);

PREPARE stmt FROM @add_locked_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add closed_at column if missing
SELECT COUNT(*) INTO @col_closed_at_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions'
  AND COLUMN_NAME = 'closed_at';

SET @add_closed_at = IF(
  @table_exists = 1 AND @col_closed_at_exists = 0,
  'ALTER TABLE table_service_sessions ADD COLUMN closed_at DATETIME NULL COMMENT "When session was closed" AFTER locked_at',
  'SELECT "closed_at column already exists or table missing" AS msg;'
);

PREPARE stmt FROM @add_closed_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add pos_order_snapshot_id column if missing
SELECT COUNT(*) INTO @col_snapshot_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions'
  AND COLUMN_NAME = 'pos_order_snapshot_id';

SET @add_snapshot = IF(
  @table_exists = 1 AND @col_snapshot_exists = 0,
  'ALTER TABLE table_service_sessions ADD COLUMN pos_order_snapshot_id CHAR(36) NULL COMMENT "FK to pos_order_snapshots.order_id" AFTER pos_order_id',
  'SELECT "pos_order_snapshot_id column already exists or table missing" AS msg;'
);

PREPARE stmt FROM @add_snapshot;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add reservation_id column if missing
SELECT COUNT(*) INTO @col_reservation_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions'
  AND COLUMN_NAME = 'reservation_id';

SET @add_reservation = IF(
  @table_exists = 1 AND @col_reservation_exists = 0,
  'ALTER TABLE table_service_sessions ADD COLUMN reservation_id BIGINT UNSIGNED NULL COMMENT "FK to reservations.id" AFTER pos_order_snapshot_id',
  'SELECT "reservation_id column already exists or table missing" AS msg;'
);

PREPARE stmt FROM @add_reservation;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- UPDATE 2: Create table_service_session_lines table
-- ============================================================================

SELECT COUNT(*) INTO @lines_table_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_session_lines';

SET @create_lines_table = IF(
  @lines_table_exists = 0,
  'CREATE TABLE table_service_session_lines (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_id BIGINT UNSIGNED NOT NULL COMMENT "FK to table_service_sessions.id",
    line_number INT UNSIGNED NOT NULL COMMENT "Line number within the session",
    product_id BIGINT UNSIGNED NOT NULL COMMENT "FK to items.id",
    product_name VARCHAR(255) NOT NULL COMMENT "Snapshot of product name at time of order",
    product_sku VARCHAR(255) NULL COMMENT "Snapshot of product SKU",
    quantity INT UNSIGNED NOT NULL COMMENT "Quantity ordered",
    unit_price DECIMAL(15,4) NOT NULL COMMENT "Price per unit at time of order",
    discount_amount DECIMAL(15,4) NOT NULL DEFAULT 0.00 COMMENT "Discount applied to this line",
    tax_amount DECIMAL(15,4) NOT NULL DEFAULT 0.00 COMMENT "Tax amount for this line",
    line_total DECIMAL(15,4) NOT NULL COMMENT "Total for this line (quantity * unit_price - discount + tax)",
    notes TEXT NULL COMMENT "Special instructions or notes",
    is_voided TINYINT(1) NOT NULL DEFAULT 0 COMMENT "Whether this line has been voided",
    voided_at DATETIME NULL COMMENT "When the line was voided",
    void_reason VARCHAR(255) NULL COMMENT "Reason for voiding",
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    KEY idx_session_lines_session (session_id),
    KEY idx_session_lines_product (product_id),
    
    CONSTRAINT fk_session_lines_session
      FOREIGN KEY (session_id) REFERENCES table_service_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_lines_product
      FOREIGN KEY (product_id) REFERENCES items(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    COMMENT="Individual line items within a service session"',
  'SELECT "table_service_session_lines already exists" AS msg;'
);

PREPARE stmt FROM @create_lines_table;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 'table_service_sessions columns added:' AS message;
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions'
  AND COLUMN_NAME IN ('locked_at', 'closed_at', 'pos_order_snapshot_id', 'reservation_id')
ORDER BY ORDINAL_POSITION;

SELECT 'table_service_session_lines created:' AS message;
SELECT COUNT(*) AS lines_table_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_session_lines';

SET FOREIGN_KEY_CHECKS=1;
