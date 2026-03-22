-- Backfill outlet timezone from company timezone
-- Purpose: Fix legacy outlets created before timezone inheritance was implemented
-- Date: 2026-03-20
-- Canonical rule: outlet -> company (no UTC fallback when both are NULL)
--
-- Safe to re-run: Uses UPDATE with WHERE clause, only affects NULL-outlet-timezone rows
-- whose parent company has a non-NULL timezone.

-- Step 1: Backfill only outlets whose company has a configured timezone
--         Outlets whose company also has NULL timezone are NOT backfilled
--         (they must be resolved manually or via a separate company-level fix).
UPDATE outlets o
INNER JOIN companies c ON c.id = o.company_id
SET o.timezone = c.timezone
WHERE o.timezone IS NULL
  AND c.timezone IS NOT NULL;

-- Step 2: Verification query
SELECT
  'Outlet timezone backfill verification' AS check_name,
  COUNT(*) AS total_outlets,
  SUM(CASE WHEN o.timezone IS NULL THEN 1 ELSE 0 END) AS outlets_still_null_tz,
  SUM(CASE WHEN o.timezone IS NOT NULL THEN 1 ELSE 0 END) AS outlets_with_tz,
  SUM(CASE WHEN o.timezone IS NULL AND c.timezone IS NULL THEN 1 ELSE 0 END) AS unresolved_company_null
FROM outlets o
INNER JOIN companies c ON c.id = o.company_id;

-- Step 3: Sample unresolved outlets (outlet NULL but company also NULL — requires manual fix)
SELECT
  o.id AS outlet_id,
  o.code AS outlet_code,
  o.name AS outlet_name,
  o.timezone AS outlet_timezone,
  c.code AS company_code,
  c.timezone AS company_timezone
FROM outlets o
INNER JOIN companies c ON c.id = o.company_id
WHERE o.timezone IS NULL
ORDER BY o.id
LIMIT 10;
