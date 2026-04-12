-- Migration: 0155_cleanup_old_module_format.sql
-- Description: Delete old format module_roles entries where module doesn't match Epic 39 format
--              Old format: module='users', module='companies', etc. (resource=NULL implied)
--              Epic 39 format: module='platform', module='accounting', etc. (with explicit resource)
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: YES

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ==============================================================================
-- Old modules to clean up (these are Epic 39 resources, not modules)
-- These entries have module=<resource> and resource=NULL (module-level fallback)
-- ==============================================================================

-- List of old module values that are actually Epic 39 resources (should be 'platform.<resource>')
-- These modules have entries with resource=NULL that should be deleted if Epic 39 format exists
-- Old: module='users', resource=NULL
-- New: module='platform', resource='users'

-- Log before state
SELECT 'BEFORE: Old format module_roles entries' AS msg;
SELECT mr.module, mr.resource, COUNT(*) as cnt
FROM module_roles mr
WHERE mr.module IN ('users', 'roles', 'companies', 'outlets', 'accounts', 'journals', 
                    'cash_bank', 'sales', 'payments', 'inventory', 'purchasing', 
                    'reports', 'settings', 'pos')
GROUP BY mr.module, mr.resource;

-- Check how many Epic 39 format entries exist for comparison
SELECT 'Epic 39 format entries for comparison' AS msg;
SELECT mr.module, mr.resource, COUNT(*) as cnt
FROM module_roles mr
WHERE mr.module IN ('platform', 'accounting', 'treasury', 'inventory', 'sales', 'pos', 'reservations')
  AND mr.resource IS NOT NULL
GROUP BY mr.module, mr.resource;

-- Delete old format entries
-- These are entries where module is a resource name (not a module name) and resource is NULL
DELETE FROM module_roles 
WHERE module IN ('users', 'roles', 'companies', 'outlets', 'accounts', 'journals', 
                 'cash_bank', 'sales', 'payments', 'inventory', 'purchasing', 
                 'reports', 'settings', 'pos')
  AND resource IS NULL;

-- Log after state
SELECT 'AFTER: Old format module_roles entries (should be 0)' AS msg;
SELECT mr.module, mr.resource, COUNT(*) as cnt
FROM module_roles mr
WHERE mr.module IN ('users', 'roles', 'companies', 'outlets', 'accounts', 'journals', 
                    'cash_bank', 'sales', 'payments', 'inventory', 'purchasing', 
                    'reports', 'settings', 'pos')
GROUP BY mr.module, mr.resource;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;