-- Migration: 0150_acl_permission_standardization.sql
-- Description: Standardize ALL role permissions to Epic 39 canonical values
--              Converts old module-only entries to module.resource format
--              Updates all permission masks to correct bit values
-- Source of truth: packages/modules/platform/src/companies/constants/permission-matrix.ts
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ==============================================================================
-- STEP 1: Get role IDs (they're fixed by seed)
-- ==============================================================================
SET @super_admin_role = (SELECT id FROM roles WHERE code = 'SUPER_ADMIN');
SET @owner_role = (SELECT id FROM roles WHERE code = 'OWNER');
SET @company_admin_role = (SELECT id FROM roles WHERE code = 'COMPANY_ADMIN');
SET @admin_role = (SELECT id FROM roles WHERE code = 'ADMIN');
SET @cashier_role = (SELECT id FROM roles WHERE code = 'CASHIER');
SET @accountant_role = (SELECT id FROM roles WHERE code = 'ACCOUNTANT');

-- ==============================================================================
-- STEP 2: SUPER_ADMIN - CRUDAM (63) for ALL resources
-- ==============================================================================

-- platform module resources
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'platform', 'companies', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'platform', 'users', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'platform', 'roles', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'platform', 'outlets', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'platform', 'settings', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- accounting module resources
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'accounting', 'accounts', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'accounting', 'journals', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'accounting', 'fiscal_years', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'accounting', 'reports', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- treasury module resources
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'treasury', 'transactions', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'treasury', 'accounts', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- sales module resources
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'sales', 'invoices', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'sales', 'orders', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'sales', 'payments', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- inventory module resources
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'inventory', 'items', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'inventory', 'stock', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'inventory', 'costing', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- pos module resources
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'pos', 'transactions', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'pos', 'config', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- reservations module resources
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'reservations', 'bookings', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @super_admin_role, 'reservations', 'tables', 63
FROM user_role_assignments ura
WHERE ura.role_id = @super_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- ==============================================================================
-- STEP 3: OWNER - CRUDAM (63) for ALL resources
-- ==============================================================================

-- platform module resources
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'platform', 'companies', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'platform', 'users', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'platform', 'roles', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'platform', 'outlets', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'platform', 'settings', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- accounting module resources
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'accounting', 'accounts', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'accounting', 'journals', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'accounting', 'fiscal_years', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'accounting', 'reports', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- treasury module resources
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'treasury', 'transactions', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'treasury', 'accounts', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- sales module resources
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'sales', 'invoices', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'sales', 'orders', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'sales', 'payments', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- inventory module resources
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'inventory', 'items', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'inventory', 'stock', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'inventory', 'costing', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- pos module resources
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'pos', 'transactions', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'pos', 'config', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- reservations module resources
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'reservations', 'bookings', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @owner_role, 'reservations', 'tables', 63
FROM user_role_assignments ura
WHERE ura.role_id = @owner_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- ==============================================================================
-- STEP 4: COMPANY_ADMIN - Role-specific permissions
-- Permission matrix: CRUDAM (63), CRUDA (31), CRUD (15), READ+MANAGE (33), READ (1), or 0
-- ==============================================================================

-- platform: companies=0, users=CRUDA(31), roles=0, outlets=CRUDA(31), settings=CRUDA(31)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'platform', 'companies', 0
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'platform', 'users', 31
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'platform', 'roles', 0
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'platform', 'outlets', 31
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'platform', 'settings', 31
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- accounting: accounts=READ+MANAGE(33), journals=CRUDA(31), fiscal_years=READ+MANAGE(33), reports=CRUDA(31)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'accounting', 'accounts', 33
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'accounting', 'journals', 31
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'accounting', 'fiscal_years', 33
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'accounting', 'reports', 31
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- treasury: transactions=CRUDA(31), accounts=READ+MANAGE(33)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'treasury', 'transactions', 31
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'treasury', 'accounts', 33
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- sales: invoices=CRUDA(31), orders=CRUDA(31), payments=CRUDA(31)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'sales', 'invoices', 31
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'sales', 'orders', 31
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'sales', 'payments', 31
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- inventory: items=CRUD(15), stock=CRUD(15), costing=READ+MANAGE(33)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'inventory', 'items', 15
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'inventory', 'stock', 15
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'inventory', 'costing', 33
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- pos: transactions=CRUDA(31), config=CRUDA(31)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'pos', 'transactions', 31
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'pos', 'config', 31
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- reservations: bookings=CRUDA(31), tables=CRUDA(31)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'reservations', 'bookings', 31
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @company_admin_role, 'reservations', 'tables', 31
FROM user_role_assignments ura
WHERE ura.role_id = @company_admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- ==============================================================================
-- STEP 5: ADMIN - Role-specific permissions
-- Permission matrix: CRUDA (31), READ (1), or 0
-- ==============================================================================

-- platform: companies=0, users=READ(1), roles=READ(1), outlets=READ(1), settings=READ(1)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'platform', 'companies', 0
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'platform', 'users', 1
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'platform', 'roles', 1
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'platform', 'outlets', 1
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'platform', 'settings', 1
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- accounting: accounts=READ(1), journals=CRUDA(31), fiscal_years=READ(1), reports=READ(1)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'accounting', 'accounts', 1
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'accounting', 'journals', 31
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'accounting', 'fiscal_years', 1
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'accounting', 'reports', 1
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- treasury: transactions=CRUDA(31), accounts=READ(1)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'treasury', 'transactions', 31
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'treasury', 'accounts', 1
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- sales: invoices=CRUDA(31), orders=CRUDA(31), payments=CRUDA(31)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'sales', 'invoices', 31
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'sales', 'orders', 31
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'sales', 'payments', 31
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- inventory: items=CRUDA(31), stock=CRUDA(31), costing=READ(1)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'inventory', 'items', 31
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'inventory', 'stock', 31
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'inventory', 'costing', 1
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- pos: transactions=CRUDA(31), config=CRUDA(31)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'pos', 'transactions', 31
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'pos', 'config', 31
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- reservations: bookings=CRUDA(31), tables=READ(1)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'reservations', 'bookings', 31
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @admin_role, 'reservations', 'tables', 1
FROM user_role_assignments ura
WHERE ura.role_id = @admin_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- ==============================================================================
-- STEP 6: CASHIER - Role-specific permissions
-- Permission matrix: READ(1), CRUDA(31), or 0
-- ==============================================================================

-- platform: companies=0, users=0, roles=0, outlets=READ(1), settings=0
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'platform', 'companies', 0
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'platform', 'users', 0
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'platform', 'roles', 0
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'platform', 'outlets', 1
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'platform', 'settings', 0
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- accounting: all 0 except accounts=READ(1)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'accounting', 'accounts', 0
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'accounting', 'journals', 0
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'accounting', 'fiscal_years', 0
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'accounting', 'reports', 0
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- treasury: transactions=0, accounts=READ(1)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'treasury', 'transactions', 0
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'treasury', 'accounts', 1
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- sales: invoices=CRUDA(31), orders=CRUDA(31), payments=CRUDA(31)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'sales', 'invoices', 31
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'sales', 'orders', 31
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'sales', 'payments', 31
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- inventory: items=READ(1), stock=0
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'inventory', 'items', 1
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'inventory', 'stock', 0
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'inventory', 'costing', 0
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- pos: transactions=CRUDA(31), config=0
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'pos', 'transactions', 31
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'pos', 'config', 0
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- reservations: bookings=CRUDA(31), tables=CRUDA(31)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'reservations', 'bookings', 31
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @cashier_role, 'reservations', 'tables', 31
FROM user_role_assignments ura
WHERE ura.role_id = @cashier_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- ==============================================================================
-- STEP 7: ACCOUNTANT - Role-specific permissions
-- Permission matrix: READ(1), CRUDA(31), or 0
-- ==============================================================================

-- platform: companies=0, users=READ(1), roles=0, outlets=READ(1), settings=0
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'platform', 'companies', 0
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'platform', 'users', 1
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'platform', 'roles', 0
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'platform', 'outlets', 1
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'platform', 'settings', 0
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- accounting: accounts=READ(1), journals=CRUDA(31), fiscal_years=READ(1), reports=CRUDA(31)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'accounting', 'accounts', 1
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'accounting', 'journals', 31
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'accounting', 'fiscal_years', 1
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'accounting', 'reports', 31
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- treasury: transactions=READ(1), accounts=READ(1)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'treasury', 'transactions', 1
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'treasury', 'accounts', 1
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- sales: invoices=READ(1), orders=READ(1), payments=READ(1)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'sales', 'invoices', 1
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'sales', 'orders', 1
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'sales', 'payments', 1
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- inventory: items=READ(1), stock=READ(1), costing=READ(1)
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'inventory', 'items', 1
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'inventory', 'stock', 1
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'inventory', 'costing', 1
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- pos: all 0
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'pos', 'transactions', 0
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'pos', 'config', 0
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- reservations: all 0
INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'reservations', 'bookings', 0
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

INSERT INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT DISTINCT ura.company_id, @accountant_role, 'reservations', 'tables', 0
FROM user_role_assignments ura
WHERE ura.role_id = @accountant_role
ON DUPLICATE KEY UPDATE permission_mask = VALUES(permission_mask);

-- ==============================================================================
-- STEP 8: Cleanup old module-only entries (NULL resource)
-- This removes the legacy entries that were copied from module-level to resource-level
-- in migration 0148. They are now replaced by the standardized entries above.
-- Comment out if you need to keep them as fallback.
-- ==============================================================================
-- DELETE FROM module_roles WHERE resource IS NULL AND module IN (
--   'platform', 'accounting', 'treasury', 'sales', 'inventory', 'pos', 'reservations'
-- );

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
