-- Migration: 0171_acl_purchasing_exchange_rates.sql
-- Story: Epic 46.2 - Exchange Rate Table ACL
-- Description: Add purchasing.exchange_rates ACL entries for all companies.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Seed ACL for ALL companies via CROSS JOIN (mirrors 0169 pattern for suppliers)
-- SUPER_ADMIN, OWNER, COMPANY_ADMIN get CRUDAM (63)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id as company_id, r.id as role_id, 'purchasing', 'exchange_rates', 63
FROM companies c
CROSS JOIN roles r
WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN');

-- ADMIN gets CRUDA (31)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id as company_id, r.id as role_id, 'purchasing', 'exchange_rates', 31
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'ADMIN';

-- ACCOUNTANT gets CRUDA (31)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id as company_id, r.id as role_id, 'purchasing', 'exchange_rates', 31
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'ACCOUNTANT';

-- CASHIER gets 0 (no access)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id as company_id, r.id as role_id, 'purchasing', 'exchange_rates', 0
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'CASHIER';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;