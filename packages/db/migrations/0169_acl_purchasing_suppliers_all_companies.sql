-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0169_acl_purchasing_suppliers_all_companies
-- Story: Epic 46.1 - Supplier Master ACL (P2 fix)
-- Description: Seed purchasing.suppliers ACL for ALL companies directly via companies table.
--              This fixes the coverage gap where companies without platform.outlets module_roles
--              entries were not receiving purchasing.suppliers ACL.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Ensure the 'purchasing' module exists in the modules table
INSERT IGNORE INTO modules (code, name) VALUES ('purchasing', 'Purchasing');

-- Seed ACL for ALL companies by directly querying the companies table
-- This ensures companies without platform.outlets module_roles still get purchasing.suppliers ACL

-- SUPER_ADMIN, OWNER, COMPANY_ADMIN get CRUDAM (63)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id as company_id, r.id as role_id, 'purchasing', 'suppliers', 63
FROM companies c
CROSS JOIN roles r
WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN');

-- ADMIN gets CRUDA (31)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id as company_id, r.id as role_id, 'purchasing', 'suppliers', 31
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'ADMIN';

-- ACCOUNTANT gets CRUDA (31)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id as company_id, r.id as role_id, 'purchasing', 'suppliers', 31
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'ACCOUNTANT';

-- CASHIER gets 0 (no access)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id as company_id, r.id as role_id, 'purchasing', 'suppliers', 0
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'CASHIER';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
