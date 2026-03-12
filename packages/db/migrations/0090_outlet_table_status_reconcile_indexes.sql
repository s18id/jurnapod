-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Improves table-status reconciliation queries used by reservations and sync push.

SET @idx_pos_order_snapshots_scope_table_service_state_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'pos_order_snapshots'
    AND INDEX_NAME = 'idx_pos_order_snapshots_scope_table_service_state'
);

SET @add_idx_pos_order_snapshots_scope_table_service_state_sql := IF(
  @idx_pos_order_snapshots_scope_table_service_state_exists = 0,
  'ALTER TABLE pos_order_snapshots ADD KEY idx_pos_order_snapshots_scope_table_service_state (company_id, outlet_id, table_id, service_type, order_state)',
  'SELECT 1'
);

PREPARE stmt FROM @add_idx_pos_order_snapshots_scope_table_service_state_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_reservations_scope_table_status_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reservations'
    AND INDEX_NAME = 'idx_reservations_scope_table_status'
);

SET @add_idx_reservations_scope_table_status_sql := IF(
  @idx_reservations_scope_table_status_exists = 0,
  'ALTER TABLE reservations ADD KEY idx_reservations_scope_table_status (company_id, outlet_id, table_id, status)',
  'SELECT 1'
);

PREPARE stmt FROM @add_idx_reservations_scope_table_status_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
