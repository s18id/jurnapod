-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0192_ap_reconciliation_snapshots_auto_generated_backfill.sql
-- Story 47.6 remediation: ensure auto_generated column/index exist for snapshot table
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Add auto_generated column if missing (legacy 0190 runs)
SET @col_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'ap_reconciliation_snapshots'
    AND column_name = 'auto_generated'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE ap_reconciliation_snapshots ADD COLUMN auto_generated TINYINT(1) NOT NULL DEFAULT 0 AFTER created_by',
  'SELECT ''auto_generated column already exists'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add auto-generated filtering index if missing
SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'ap_reconciliation_snapshots'
    AND index_name = 'idx_snapshot_company_auto_date'
);

SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE ap_reconciliation_snapshots ADD INDEX idx_snapshot_company_auto_date (company_id, auto_generated, as_of_date)',
  'SELECT ''idx_snapshot_company_auto_date already exists'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
