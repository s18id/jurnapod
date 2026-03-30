-- Migration: 0130_add_company_id_to_user_role_assignments.sql
-- Add company_id column to user_role_assignments for direct tenant scoping
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Add company_id column if not exists (idempotent)
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
    AND table_name = 'user_role_assignments' 
    AND column_name = 'company_id'
);
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE user_role_assignments ADD COLUMN company_id bigint(20) unsigned NOT NULL AFTER role_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill company_id from users table (for global roles where outlet_id IS NULL)
UPDATE user_role_assignments ura
INNER JOIN users u ON u.id = ura.user_id
SET ura.company_id = u.company_id
WHERE ura.outlet_id IS NULL AND ura.company_id IS NULL;

-- Backfill company_id from outlets table (for outlet-specific roles)
UPDATE user_role_assignments ura
INNER JOIN outlets o ON o.id = ura.outlet_id
SET ura.company_id = o.company_id
WHERE ura.outlet_id IS NOT NULL AND ura.company_id IS NULL;

-- Add index on company_id for tenant scoping
SET @index_exists = (
  SELECT COUNT(*) FROM information_schema.statistics 
  WHERE table_schema = DATABASE() 
    AND table_name = 'user_role_assignments' 
    AND index_name = 'idx_user_role_assignments_company'
);
SET @sql = IF(@index_exists = 0,
  'ALTER TABLE user_role_assignments ADD INDEX idx_user_role_assignments_company (company_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add foreign key constraint to companies if not exists
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.table_constraints 
  WHERE table_schema = DATABASE() 
    AND table_name = 'user_role_assignments' 
    AND constraint_name = 'fk_user_role_assignments_company'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE user_role_assignments ADD CONSTRAINT fk_user_role_assignments_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
