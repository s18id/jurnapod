-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0163_fix_owner_outlet_id_null
-- Story: Epic 44.1 - Customer Master CRUD
-- Description: Fix seed data bug where OWNER role assignment for company 1
--            has outlet_id = 1 instead of NULL. Global roles must have
--            outlet_id = NULL for canManageCompanyDefaults() ACL checks to work.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Fix OWNER role assignment for company 1 (JP company, user_id=1)
-- Global OWNER role must have outlet_id = NULL
UPDATE user_role_assignments
SET outlet_id = NULL
WHERE user_id = 1
  AND role_id = 8
  AND company_id = 1
  AND outlet_id IS NOT NULL;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;