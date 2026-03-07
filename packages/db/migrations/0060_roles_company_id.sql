-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Add company_id to roles table for custom roles
-- System roles (built-in) will have NULL company_id
-- Custom roles will have a company_id pointing to the tenant

-- Step 1: Add company_id column (idempotent)
SET @company_id_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'roles'
    AND column_name = 'company_id'
);

SET @stmt = IF(
  @company_id_exists > 0,
  'SELECT 1',
  'ALTER TABLE roles ADD COLUMN company_id BIGINT UNSIGNED NULL COMMENT ''NULL = system role, non-NULL = custom company role'''
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 2: Add index for company_id lookups (idempotent)
SET @idx_company_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'roles'
    AND index_name = 'idx_roles_company_id'
);

SET @stmt = IF(
  @idx_company_exists > 0,
  'SELECT 1',
  'ALTER TABLE roles ADD INDEX idx_roles_company_id (company_id)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: Add foreign key to companies (idempotent)
SET @fk_company_exists = (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'roles'
    AND constraint_name = 'fk_roles_company'
);

SET @stmt = IF(
  @fk_company_exists > 0,
  'SELECT 1',
  'ALTER TABLE roles ADD CONSTRAINT fk_roles_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 4: Replace unique constraint on code to be company-scoped
-- First, drop existing unique constraint (idempotent)
SET @old_unique_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'roles'
    AND index_name = 'uq_roles_code'
);

SET @stmt = IF(
  @old_unique_exists > 0,
  'ALTER TABLE roles DROP INDEX uq_roles_code',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 5: Add company-scoped unique constraint (idempotent)
-- Allows same code across different companies, but not within a company
SET @new_unique_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'roles'
    AND index_name = 'uq_roles_company_code'
);

SET @stmt = IF(
  @new_unique_exists > 0,
  'SELECT 1',
  'ALTER TABLE roles ADD UNIQUE KEY uq_roles_company_code (company_id, code)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 6: Add comment to table for documentation
ALTER TABLE roles
  COMMENT = 'Roles: company_id=NULL for system roles, company_id=N for custom company roles. Unique within company.';
