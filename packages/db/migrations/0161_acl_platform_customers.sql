-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0161_acl_platform_customers
-- Story: Epic 44 - Missing platform.customers ACL entries
-- Description: Add platform.customers ACL entries for all companies/roles.
--            Migration 0158 expanded platform resources to resource-level but did NOT
--            include 'customers'. This migration adds the missing entries using the
--            canonical permission masks from roles.defaults.json.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Add platform.customers for each canonical system role.
-- Uses INSERT IGNORE so existing entries are preserved.
-- SUPER_ADMIN, OWNER, COMPANY_ADMIN get CRUDAM (63)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT mr.company_id, mr.role_id, 'platform', 'customers', 63
FROM module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
WHERE mr.module = 'platform'
  AND mr.resource = 'outlets'
  AND r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN');

-- ADMIN and ACCOUNTANT get READ (1)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT mr.company_id, mr.role_id, 'platform', 'customers', 1
FROM module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
WHERE mr.module = 'platform'
  AND mr.resource = 'outlets'
  AND r.code IN ('ADMIN', 'ACCOUNTANT');

-- CASHIER gets 0 (no access) - still insert for completeness/audit
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT mr.company_id, mr.role_id, 'platform', 'customers', 0
FROM module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
WHERE mr.module = 'platform'
  AND mr.resource = 'outlets'
  AND r.code = 'CASHIER';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;