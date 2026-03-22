-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- One-off audit script: find reservation rows that reference missing outlet_tables.
-- Safe: read-only queries only (no UPDATE/DELETE).

SELECT '=== Reservation Table Integrity Audit ===' AS section;

-- Check whether scoped FK is present.
SELECT
  'fk_reservations_table_scoped exists' AS check_name,
  CASE
    WHEN COUNT(*) > 0 THEN 'PASS'
    ELSE 'MISSING'
  END AS status
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reservations'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  AND CONSTRAINT_NAME = 'fk_reservations_table_scoped';

-- Headline count of orphaned rows (table_id set, no matching outlet_table).
SELECT
  'orphan_reservations_total' AS metric,
  COUNT(*) AS total_orphans
FROM reservations r
LEFT JOIN outlet_tables t
  ON t.company_id = r.company_id
 AND t.outlet_id = r.outlet_id
 AND t.id = r.table_id
WHERE r.table_id IS NOT NULL
  AND t.id IS NULL;

-- Breakdown by company/outlet/status for impact analysis.
SELECT
  r.company_id,
  r.outlet_id,
  r.status,
  COUNT(*) AS orphan_count
FROM reservations r
LEFT JOIN outlet_tables t
  ON t.company_id = r.company_id
 AND t.outlet_id = r.outlet_id
 AND t.id = r.table_id
WHERE r.table_id IS NOT NULL
  AND t.id IS NULL
GROUP BY r.company_id, r.outlet_id, r.status
ORDER BY orphan_count DESC, r.company_id, r.outlet_id, r.status;

-- Detailed sample rows for manual investigation (latest first).
SELECT
  r.id AS reservation_id,
  r.company_id,
  r.outlet_id,
  r.table_id,
  r.customer_name,
  r.status,
  r.reservation_at,
  r.duration_minutes,
  r.created_at,
  r.updated_at
FROM reservations r
LEFT JOIN outlet_tables t
  ON t.company_id = r.company_id
 AND t.outlet_id = r.outlet_id
 AND t.id = r.table_id
WHERE r.table_id IS NOT NULL
  AND t.id IS NULL
ORDER BY r.updated_at DESC, r.id DESC
LIMIT 200;

-- Optional target filter example:
-- WHERE r.company_id = 1 AND r.outlet_id = 1
