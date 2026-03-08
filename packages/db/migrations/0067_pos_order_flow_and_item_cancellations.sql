-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

ALTER TABLE pos_order_snapshots
  ADD COLUMN IF NOT EXISTS source_flow VARCHAR(16) NULL AFTER service_type,
  ADD COLUMN IF NOT EXISTS settlement_flow VARCHAR(16) NULL AFTER source_flow,
  ADD CONSTRAINT chk_pos_order_snapshots_source_flow CHECK (source_flow IS NULL OR source_flow IN ('WALK_IN', 'RESERVATION', 'PHONE', 'ONLINE', 'MANUAL')),
  ADD CONSTRAINT chk_pos_order_snapshots_settlement_flow CHECK (settlement_flow IS NULL OR settlement_flow IN ('IMMEDIATE', 'DEFERRED', 'SPLIT'));

CREATE TABLE IF NOT EXISTS pos_item_cancellations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cancellation_id CHAR(36) NOT NULL,
  update_id CHAR(36) NULL,
  order_id CHAR(36) NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  cancelled_quantity DECIMAL(18,4) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  cancelled_by_user_id BIGINT UNSIGNED NULL,
  cancelled_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pos_item_cancellations_cancellation_id (cancellation_id),
  KEY idx_pos_item_cancellations_scope_order_time (company_id, outlet_id, order_id, cancelled_at),
  KEY idx_pos_item_cancellations_update_id (update_id),
  CONSTRAINT chk_pos_item_cancellations_cancelled_quantity CHECK (cancelled_quantity > 0),
  CONSTRAINT fk_pos_item_cancellations_order_snapshot FOREIGN KEY (order_id) REFERENCES pos_order_snapshots(order_id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_item_cancellations_order_update FOREIGN KEY (update_id) REFERENCES pos_order_updates(update_id) ON DELETE SET NULL,
  CONSTRAINT fk_pos_item_cancellations_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_pos_item_cancellations_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  CONSTRAINT fk_pos_item_cancellations_actor FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
