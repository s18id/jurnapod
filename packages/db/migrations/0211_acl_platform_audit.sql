-- Migration: 0211_acl_platform_audit.sql
-- Story: 68-4 — platform.audit ACL resource (E66-A1 resolution)
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Description: Seed resource-level platform.audit permissions for existing companies.

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- platform.audit = 0 → CASHIER (no audit access)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id AS company_id, r.id AS role_id, 'platform', 'audit', 0
FROM companies c
JOIN roles r ON r.code IN ('CASHIER');

-- platform.audit = 1 → ACCOUNTANT, ADMIN (read-only audit access)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id AS company_id, r.id AS role_id, 'platform', 'audit', 1
FROM companies c
JOIN roles r ON r.code IN ('ACCOUNTANT', 'ADMIN');

-- platform.audit = 31 → COMPANY_ADMIN (CRUDA)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id AS company_id, r.id AS role_id, 'platform', 'audit', 31
FROM companies c
JOIN roles r ON r.code IN ('COMPANY_ADMIN');

-- platform.audit = 63 → OWNER, SUPER_ADMIN (full CRUDAM)
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id AS company_id, r.id AS role_id, 'platform', 'audit', 63
FROM companies c
JOIN roles r ON r.code IN ('OWNER', 'SUPER_ADMIN');

SET UNIQUE_CHECKS=1;
SET FOREIGN_KEY_CHECKS=1;
