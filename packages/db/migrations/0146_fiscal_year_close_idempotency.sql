-- Migration: 0146_fiscal_year_close_idempotency.sql
-- Description: Add fiscal_year_close_requests table for idempotent fiscal year close procedure
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

-- ==============================================================================
-- Step 1: Create fiscal_year_close_requests table
-- ==============================================================================

CREATE TABLE IF NOT EXISTS fiscal_year_close_requests (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  company_id BIGINT NOT NULL,
  fiscal_year_id BIGINT NOT NULL,
  close_request_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  fiscal_year_status_before VARCHAR(32) NOT NULL,
  fiscal_year_status_after VARCHAR(32) NOT NULL,
  result_json JSON NULL,
  failure_code VARCHAR(64) NULL,
  failure_message TEXT NULL,
  requested_by_user_id BIGINT NOT NULL,
  requested_at_ts BIGINT NOT NULL,
  started_at_ts BIGINT NULL,
  completed_at_ts BIGINT NULL,
  created_at_ts BIGINT NOT NULL,
  updated_at_ts BIGINT NOT NULL,
  UNIQUE KEY uq_fy_close_idem (company_id, fiscal_year_id, close_request_id),
  KEY idx_fy_close_status (company_id, fiscal_year_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- Step 2: Add index for querying by company and status
-- ==============================================================================

SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'fiscal_year_close_requests'
    AND index_name = 'idx_fy_close_status'
);
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_fy_close_status ON fiscal_year_close_requests (company_id, fiscal_year_id, status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
