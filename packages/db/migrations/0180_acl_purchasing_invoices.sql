-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0180_acl_purchasing_invoices
-- Story: Epic 46.5 - Purchase Invoice Schema Foundation (Scope B)
-- Description: Seed purchasing.invoices ACL for ALL companies/roles.
--              Following the same pattern as purchasing.suppliers ACL.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- Ensure the 'purchasing' module exists in the modules table
INSERT IGNORE INTO modules (code, name) VALUES ('purchasing', 'Purchasing');

-- Seed ACL for ALL companies by directly querying the companies table
-- This ensures companies without platform.outlets module_roles still get purchasing.invoices ACL

-- SUPER_ADMIN, OWNER, COMPANY_ADMIN get CRUDAM (63)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id as company_id, r.id as role_id, 'purchasing', 'invoices', 63
FROM companies c
CROSS JOIN roles r
WHERE r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN');

-- ADMIN gets CRUDA (31)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id as company_id, r.id as role_id, 'purchasing', 'invoices', 31
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'ADMIN';

-- ACCOUNTANT gets CRUDA (31)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id as company_id, r.id as role_id, 'purchasing', 'invoices', 31
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'ACCOUNTANT';

-- CASHIER gets 0 (no access)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id as company_id, r.id as role_id, 'purchasing', 'invoices', 0
FROM companies c
CROSS JOIN roles r
WHERE r.code = 'CASHIER';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;