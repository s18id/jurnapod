-- Migration: 0138_fix_company_id_backfill.sql
-- Fix company_id backfill in user_role_assignments
-- The original migration (0130) added company_id as NOT NULL but checked IS NULL in backfill,
-- which never matches for NOT NULL columns. This left 368 rows with company_id = 0.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- First, verify the issue exists
SET @wrong_count = (
  SELECT COUNT(*) FROM user_role_assignments 
  WHERE company_id = 0 AND outlet_id IS NULL
);
SELECT CONCAT('Rows with company_id=0 (global roles): ', @wrong_count) AS status;

-- Fix 1: Global roles (outlet_id IS NULL) - get company_id from users table
UPDATE user_role_assignments ura
INNER JOIN users u ON u.id = ura.user_id
SET ura.company_id = u.company_id
WHERE ura.outlet_id IS NULL AND ura.company_id = 0;

-- Fix 2: Outlet roles (outlet_id IS NOT NULL) - get company_id from outlets table  
UPDATE user_role_assignments ura
INNER JOIN outlets o ON o.id = ura.outlet_id
SET ura.company_id = o.company_id
WHERE ura.outlet_id IS NOT NULL AND ura.company_id = 0;

-- Verify the fix
SET @remaining_wrong = (
  SELECT COUNT(*) FROM user_role_assignments WHERE company_id = 0
);
SELECT CONCAT('Remaining rows with company_id=0: ', @remaining_wrong) AS status;

-- Show sample of corrected rows
SELECT ura.id, ura.user_id, ura.company_id, ura.outlet_id, r.code as role_code, u.email
FROM user_role_assignments ura
INNER JOIN roles r ON r.id = ura.role_id
INNER JOIN users u ON u.id = ura.user_id
WHERE ura.company_id = u.company_id
LIMIT 5;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
