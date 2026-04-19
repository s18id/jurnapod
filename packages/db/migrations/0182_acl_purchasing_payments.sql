-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0182_acl_purchasing_payments.sql
-- Story 46.6 Scope A: AP Payments ACL seed
-- Description: Add purchasing.payments ACL entries for all companies/roles.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- SUPER_ADMIN, OWNER, COMPANY_ADMIN get CRUDAM (63)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT mr.company_id, mr.role_id, 'purchasing', 'payments', 63
FROM module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
WHERE mr.module = 'platform'
  AND mr.resource = 'outlets'
  AND r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN');

-- ADMIN gets CRUDA (31)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT mr.company_id, mr.role_id, 'purchasing', 'payments', 31
FROM module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
WHERE mr.module = 'platform'
  AND mr.resource = 'outlets'
  AND r.code = 'ADMIN';

-- ACCOUNTANT gets CRUDA (31)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT mr.company_id, mr.role_id, 'purchasing', 'payments', 31
FROM module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
WHERE mr.module = 'platform'
  AND mr.resource = 'outlets'
  AND r.code = 'ACCOUNTANT';

-- CASHIER gets 0 (no access)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT mr.company_id, mr.role_id, 'purchasing', 'payments', 0
FROM module_roles mr
INNER JOIN roles r ON r.id = mr.role_id
WHERE mr.module = 'platform'
  AND mr.resource = 'outlets'
  AND r.code = 'CASHIER';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
