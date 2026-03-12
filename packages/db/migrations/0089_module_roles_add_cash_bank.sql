-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Seed/update module_roles defaults for cash_bank module by company and role.

INSERT INTO module_roles (company_id, role_id, module, permission_mask)
SELECT c.id AS company_id,
       r.id AS role_id,
       'cash_bank' AS module,
       CASE r.code
         WHEN 'SUPER_ADMIN' THEN 15
         WHEN 'OWNER' THEN 15
         WHEN 'COMPANY_ADMIN' THEN 15
         WHEN 'ADMIN' THEN 15
         WHEN 'ACCOUNTANT' THEN 3
         WHEN 'CASHIER' THEN 0
         ELSE 0
       END AS permission_mask
FROM companies c
INNER JOIN roles r
  ON r.code IN ('SUPER_ADMIN', 'OWNER', 'COMPANY_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER')
ON DUPLICATE KEY UPDATE
  permission_mask = VALUES(permission_mask),
  updated_at = CURRENT_TIMESTAMP;
