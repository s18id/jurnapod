-- Backfill outlet timezone from company timezone
-- Purpose: Fix legacy outlets created before timezone inheritance was implemented
-- Date: 2026-03-20
-- Safe to re-run: Uses UPDATE with WHERE clause, only affects NULL timezones

-- Step 1: Backfill outlets with NULL timezone
UPDATE outlets o
INNER JOIN companies c ON c.id = o.company_id
SET o.timezone = COALESCE(c.timezone, 'UTC')
WHERE o.timezone IS NULL;

-- Step 2: Verification query
SELECT 
  'Outlet timezone backfill verification' AS check_name,
  COUNT(*) AS total_outlets,
  SUM(CASE WHEN o.timezone IS NULL THEN 1 ELSE 0 END) AS outlets_with_null_tz,
  SUM(CASE WHEN o.timezone IS NOT NULL THEN 1 ELSE 0 END) AS outlets_with_tz
FROM outlets o;

-- Step 3: Sample affected outlets
SELECT 
  o.id,
  o.code,
  o.name,
  o.timezone AS outlet_timezone,
  c.code AS company_code,
  c.timezone AS company_timezone
FROM outlets o
INNER JOIN companies c ON c.id = o.company_id
ORDER BY o.id
LIMIT 10;
