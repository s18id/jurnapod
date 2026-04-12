-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0156_fix_admin_accountant_permissions
-- Description: Fix ADMIN and ACCOUNTANT permission bitmasks to match canonical values
-- Source of truth: @jurnapod/shared/src/constants/roles.defaults.json
--
-- ADMIN permissions:
--   inventory:items = 31 (CRUDA), was 7 (CRUD)
--   inventory:stock = 31 (CRUDA), was 7 (CRUD)
--   inventory:costing = 1 (READ), was 7 (CRUD)
--   pos:transactions = 31 (CRUDA), was 255 (full access)
--   pos:config = 31 (CRUDA), was 255 (full access)
--
-- ACCOUNTANT permissions:
--   inventory:items = 1 (READ), was 0
--   inventory:stock = 1 (READ), was 0
--   inventory:costing = 1 (READ), was 0

-- Update ADMIN inventory:items (should be 31 CRUDA, not 7 CRUD)
UPDATE module_roles
SET permission_mask = 31, updated_at = CURRENT_TIMESTAMP
WHERE role_id = (SELECT id FROM roles WHERE code = 'ADMIN' LIMIT 1)
  AND module = 'inventory'
  AND resource = 'items'
  AND permission_mask = 7;

-- Update ADMIN inventory:stock (should be 31 CRUDA, not 7 CRUD)
UPDATE module_roles
SET permission_mask = 31, updated_at = CURRENT_TIMESTAMP
WHERE role_id = (SELECT id FROM roles WHERE code = 'ADMIN' LIMIT 1)
  AND module = 'inventory'
  AND resource = 'stock'
  AND permission_mask = 7;

-- Update ADMIN inventory:costing (should be 1 READ, not 7 CRUD)
UPDATE module_roles
SET permission_mask = 1, updated_at = CURRENT_TIMESTAMP
WHERE role_id = (SELECT id FROM roles WHERE code = 'ADMIN' LIMIT 1)
  AND module = 'inventory'
  AND resource = 'costing'
  AND permission_mask = 7;

-- Update ADMIN pos:transactions (should be 31 CRUDA, not 255 full access)
UPDATE module_roles
SET permission_mask = 31, updated_at = CURRENT_TIMESTAMP
WHERE role_id = (SELECT id FROM roles WHERE code = 'ADMIN' LIMIT 1)
  AND module = 'pos'
  AND resource = 'transactions'
  AND permission_mask = 255;

-- Update ADMIN pos:config (should be 31 CRUDA, not 255 full access)
UPDATE module_roles
SET permission_mask = 31, updated_at = CURRENT_TIMESTAMP
WHERE role_id = (SELECT id FROM roles WHERE code = 'ADMIN' LIMIT 1)
  AND module = 'pos'
  AND resource = 'config'
  AND permission_mask = 255;

-- Update ACCOUNTANT inventory:items (should be 1 READ, not 0)
UPDATE module_roles
SET permission_mask = 1, updated_at = CURRENT_TIMESTAMP
WHERE role_id = (SELECT id FROM roles WHERE code = 'ACCOUNTANT' LIMIT 1)
  AND module = 'inventory'
  AND resource = 'items'
  AND permission_mask = 0;

-- Update ACCOUNTANT inventory:stock (should be 1 READ, not 0)
UPDATE module_roles
SET permission_mask = 1, updated_at = CURRENT_TIMESTAMP
WHERE role_id = (SELECT id FROM roles WHERE code = 'ACCOUNTANT' LIMIT 1)
  AND module = 'inventory'
  AND resource = 'stock'
  AND permission_mask = 0;

-- Update ACCOUNTANT inventory:costing (should be 1 READ, not 0)
UPDATE module_roles
SET permission_mask = 1, updated_at = CURRENT_TIMESTAMP
WHERE role_id = (SELECT id FROM roles WHERE code = 'ACCOUNTANT' LIMIT 1)
  AND module = 'inventory'
  AND resource = 'costing'
  AND permission_mask = 0;
