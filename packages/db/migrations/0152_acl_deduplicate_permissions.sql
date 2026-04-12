-- Migration: 0152_acl_deduplicate_permissions.sql
-- Description: Remove duplicate module_roles entries, keeping only one per unique key
--              (company_id, role_id, module, resource). Keeps the entry with the highest ID.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: YES (DELETE operations are safe to rerun)

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ==============================================================================
-- STEP 1: Deduplicate module_roles entries
-- For each duplicate group (same company_id, role_id, module, resource),
-- keep only the row with the highest ID (most recent).
-- ==============================================================================

-- Log before count
SELECT 'BEFORE: module_roles total rows:' AS msg;
SELECT COUNT(*) AS total FROM module_roles;

-- Delete duplicate entries, keeping highest ID
DELETE mr1 FROM module_roles mr1
INNER JOIN module_roles mr2 
WHERE mr1.id < mr2.id 
  AND mr1.company_id = mr2.company_id 
  AND mr1.role_id = mr2.role_id 
  AND mr1.module = mr2.module 
  AND (mr1.resource <=> mr2.resource);

-- Log after count
SELECT 'AFTER: module_roles total rows:' AS msg;
SELECT COUNT(*) AS total FROM module_roles;

-- ==============================================================================
-- STEP 2: Verify deduplication - should return no rows
-- ==============================================================================

SELECT 'Remaining duplicates check:' AS msg;
SELECT company_id, role_id, module, resource, COUNT(*) as cnt
FROM module_roles 
GROUP BY company_id, role_id, module, resource
HAVING cnt > 1;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;