-- Migration: 0173_acl_purchasing_orders.sql
-- Seed purchasing.orders ACL for existing companies

SET @module = 'purchasing';
SET @resource = 'orders';

-- Insert ACL for all existing companies and system roles
INSERT IGNORE INTO module_roles (company_id, role_id, module, resource, permission_mask)
SELECT c.id, r.id, @module, @resource,
  CASE r.code
    WHEN 'SUPER_ADMIN' THEN 63
    WHEN 'OWNER' THEN 63
    WHEN 'COMPANY_ADMIN' THEN 63
    WHEN 'ADMIN' THEN 31
    WHEN 'ACCOUNTANT' THEN 31
    WHEN 'CASHIER' THEN 0
    ELSE 0
  END as permission_mask
FROM companies c, roles r
WHERE c.deleted_at IS NULL
  AND r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER')
  AND r.company_id IS NULL;