-- Migration: 0151_acl_cleanup_conflicts.sql
-- Description: Remove conflicting old permission entries from migrations 0147.5 and 0148
--              These entries have wrong permission bits (pre-Epic 39) or are redundant
--              since migration 0150 created correct canonical resource-level permissions.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ==============================================================================
-- STEP 1: Delete ALL module-level (NULL resource) entries
-- Migration 0147.5 created entries with old module names (users, roles, etc.)
-- and migration 0148 created NULL resource entries for inventory, sales, pos.
-- Migration 0150 created proper resource-level entries for all canonical modules.
-- The unique constraint doesn't enforce uniqueness for NULL, so duplicates exist.
-- Delete ALL NULL resource entries regardless of module name.
-- ==============================================================================

DELETE FROM module_roles WHERE resource IS NULL;

-- ==============================================================================
-- STEP 2: Delete entries with non-canonical permission masks
-- These entries have masks that don't match any Epic 39 canonical permission:
-- Canonical masks: 0 (none), 1 (READ), 15 (CRUD), 31 (CRUDA), 33 (READ+MANAGE), 63 (CRUDAM)
-- 
-- Wrong masks found (old system bits: create=1, read=2):
-- - mask=2: old CREATE, should be 1 (READ) or 0
-- - mask=3: old READ+CREATE, should be 1 (READ) or 15 (CRUD) or 0
-- - mask=18: old CREATE+ANALYZE, should be 16 (ANALYZE) or 31 (CRUDA) or 0
-- - mask=19: old READ+CREATE+ANALYZE, should be 31 (CRUDA) or 0
-- ==============================================================================

-- accounting module
DELETE FROM module_roles 
WHERE module = 'accounting' 
  AND resource = 'accounts' 
  AND permission_mask NOT IN (0, 1, 15, 31, 33, 63);

DELETE FROM module_roles 
WHERE module = 'accounting' 
  AND resource = 'reports' 
  AND permission_mask NOT IN (0, 1, 15, 31, 33, 63);

-- pos module
DELETE FROM module_roles 
WHERE module = 'pos' 
  AND resource = 'transactions' 
  AND permission_mask NOT IN (0, 1, 15, 31, 33, 63);

DELETE FROM module_roles 
WHERE module = 'pos' 
  AND resource = 'config' 
  AND permission_mask NOT IN (0, 1, 15, 31, 33, 63);

-- sales module
DELETE FROM module_roles 
WHERE module = 'sales' 
  AND resource IN ('invoices', 'orders', 'payments') 
  AND permission_mask NOT IN (0, 1, 15, 31, 33, 63);

-- treasury module
DELETE FROM module_roles 
WHERE module = 'treasury' 
  AND resource = 'transactions' 
  AND permission_mask NOT IN (0, 1, 15, 31, 33, 63);

-- platform module
DELETE FROM module_roles 
WHERE module = 'platform' 
  AND resource = 'settings' 
  AND permission_mask NOT IN (0, 1, 15, 31, 33, 63);

-- ==============================================================================
-- STEP 3: Verify cleanup
-- ==============================================================================

SELECT 'Remaining NULL resource entries:' AS msg;
SELECT module, COUNT(*) as cnt 
FROM module_roles WHERE resource IS NULL GROUP BY module;

SELECT 'Entries with non-canonical masks:' AS msg;
SELECT module, resource, permission_mask, COUNT(*) as cnt
FROM module_roles 
WHERE module IN ('platform', 'accounting', 'treasury', 'sales', 'inventory', 'pos', 'reservations')
  AND resource IS NOT NULL
  AND permission_mask NOT IN (0, 1, 15, 31, 33, 63)
GROUP BY module, resource, permission_mask;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
