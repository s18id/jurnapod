-- Reconcile outlet table statuses from active orders and reservations.

-- 1) Tables with OPEN dine-in orders -> OCCUPIED (do not override UNAVAILABLE).
UPDATE outlet_tables ot
SET status = 'OCCUPIED', updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM pos_order_snapshots pos
  WHERE pos.company_id = ot.company_id
    AND pos.outlet_id = ot.outlet_id
    AND pos.table_id = ot.id
    AND pos.order_state = 'OPEN'
    AND pos.service_type = 'DINE_IN'
)
AND ot.status != 'UNAVAILABLE';

-- 2) Tables with active reservations but no OPEN dine-in orders -> RESERVED.
UPDATE outlet_tables ot
SET status = 'RESERVED', updated_at = CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM pos_order_snapshots pos
  WHERE pos.company_id = ot.company_id
    AND pos.outlet_id = ot.outlet_id
    AND pos.table_id = ot.id
    AND pos.order_state = 'OPEN'
    AND pos.service_type = 'DINE_IN'
)
AND EXISTS (
  SELECT 1
  FROM reservations r
  WHERE r.company_id = ot.company_id
    AND r.outlet_id = ot.outlet_id
    AND r.table_id = ot.id
    AND r.status IN ('BOOKED', 'CONFIRMED', 'ARRIVED')
)
AND ot.status != 'UNAVAILABLE';

-- 3) Tables with no OPEN orders and no active reservations -> AVAILABLE.
UPDATE outlet_tables ot
SET status = 'AVAILABLE', updated_at = CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM pos_order_snapshots pos
  WHERE pos.company_id = ot.company_id
    AND pos.outlet_id = ot.outlet_id
    AND pos.table_id = ot.id
    AND pos.order_state = 'OPEN'
    AND pos.service_type = 'DINE_IN'
)
AND NOT EXISTS (
  SELECT 1
  FROM reservations r
  WHERE r.company_id = ot.company_id
    AND r.outlet_id = ot.outlet_id
    AND r.table_id = ot.id
    AND r.status IN ('BOOKED', 'CONFIRMED', 'ARRIVED')
)
AND ot.status != 'UNAVAILABLE';
