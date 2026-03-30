-- Migration: 0129_add_user_agent_to_audit_logs.sql
-- Add: user_agent column to audit_logs table for tracking browser/client info
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ============================================================================
-- Add user_agent column to audit_logs if not exists
-- ============================================================================

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'audit_logs' 
    AND column_name = 'user_agent'
);

SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE audit_logs ADD COLUMN user_agent VARCHAR(512) NULL AFTER ip_address',
  'SELECT ''user_agent column already exists'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
