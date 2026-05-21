-- Story 69-3-e: Persist fiscal year close initiation reason for audit/accountability.
-- Idempotent and compatible with MySQL 8.0+ and MariaDB.

SET @reason_col_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'fiscal_year_close_requests'
    AND column_name = 'reason'
);

SET @add_reason_col_sql = IF(
  @reason_col_exists = 0,
  'ALTER TABLE fiscal_year_close_requests ADD COLUMN reason VARCHAR(500) NULL AFTER close_request_id',
  'SELECT 1'
);

PREPARE stmt FROM @add_reason_col_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
