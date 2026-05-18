-- Migration: 0210_acl_platform_operations.sql
-- Story: 68-1 AC0 - platform.operations ACL resource
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Description: Seed resource-level platform.operations permissions for existing companies.

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- platform.operations = 0 → CASHIER
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id AS company_id, r.id AS role_id, 'platform', 'operations', 0
FROM companies c
JOIN roles r ON r.code IN ('CASHIER');

-- platform.operations = 1 → ACCOUNTANT, ADMIN
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id AS company_id, r.id AS role_id, 'platform', 'operations', 1
FROM companies c
JOIN roles r ON r.code IN ('ACCOUNTANT', 'ADMIN');

-- platform.operations = 31 → COMPANY_ADMIN
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id AS company_id, r.id AS role_id, 'platform', 'operations', 31
FROM companies c
JOIN roles r ON r.code IN ('COMPANY_ADMIN');

-- platform.operations = 63 → OWNER, SUPER_ADMIN
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id AS company_id, r.id AS role_id, 'platform', 'operations', 63
FROM companies c
JOIN roles r ON r.code IN ('OWNER', 'SUPER_ADMIN');

SET UNIQUE_CHECKS=1;
SET FOREIGN_KEY_CHECKS=1;
