-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

CREATE TABLE IF NOT EXISTS pos_order_snapshots (
  order_id CHAR(36) NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  service_type VARCHAR(16) NOT NULL,
  table_id BIGINT UNSIGNED NULL,
  reservation_id BIGINT UNSIGNED NULL,
  guest_count INT UNSIGNED NULL,
  is_finalized TINYINT(1) NOT NULL DEFAULT 0,
  order_status VARCHAR(16) NOT NULL,
  order_state VARCHAR(16) NOT NULL,
  paid_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  opened_at DATETIME NOT NULL,
  closed_at DATETIME NULL,
  notes VARCHAR(500) NULL,
  updated_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (order_id),
  KEY idx_pos_order_snapshots_scope_state_updated (company_id, outlet_id, order_state, updated_at),
  CONSTRAINT chk_pos_order_snapshots_service_type CHECK (service_type IN ('TAKEAWAY', 'DINE_IN')),
  CONSTRAINT chk_pos_order_snapshots_order_status CHECK (order_status IN ('OPEN', 'READY_TO_PAY', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT chk_pos_order_snapshots_order_state CHECK (order_state IN ('OPEN', 'CLOSED')),
  CONSTRAINT fk_pos_order_snapshots_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_pos_order_snapshots_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pos_order_snapshot_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id CHAR(36) NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  sku_snapshot VARCHAR(191) NULL,
  name_snapshot VARCHAR(191) NOT NULL,
  item_type_snapshot VARCHAR(16) NOT NULL,
  unit_price_snapshot DECIMAL(18,2) NOT NULL,
  qty DECIMAL(18,4) NOT NULL,
  discount_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pos_order_snapshot_lines_order_item (order_id, item_id),
  KEY idx_pos_order_snapshot_lines_scope_order (company_id, outlet_id, order_id),
  CONSTRAINT chk_pos_order_snapshot_lines_item_type CHECK (item_type_snapshot IN ('SERVICE', 'PRODUCT', 'INGREDIENT', 'RECIPE')),
  CONSTRAINT fk_pos_order_snapshot_lines_snapshot FOREIGN KEY (order_id) REFERENCES pos_order_snapshots(order_id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_order_snapshot_lines_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_pos_order_snapshot_lines_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pos_order_updates (
  sequence_no BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  update_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  base_order_updated_at DATETIME NULL,
  event_type VARCHAR(32) NOT NULL,
  delta_json JSON NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  device_id VARCHAR(191) NOT NULL,
  event_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (sequence_no),
  UNIQUE KEY uq_pos_order_updates_update_id (update_id),
  KEY idx_pos_order_updates_scope_seq (company_id, outlet_id, sequence_no),
  KEY idx_pos_order_updates_scope_order_event (company_id, outlet_id, order_id, event_at),
  CONSTRAINT chk_pos_order_updates_event_type CHECK (event_type IN (
    'SNAPSHOT_FINALIZED',
    'ITEM_ADDED',
    'ITEM_REMOVED',
    'QTY_CHANGED',
    'ITEM_CANCELLED',
    'NOTES_CHANGED',
    'ORDER_RESUMED',
    'ORDER_CLOSED'
  )),
  CONSTRAINT fk_pos_order_updates_snapshot FOREIGN KEY (order_id) REFERENCES pos_order_snapshots(order_id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_order_updates_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_pos_order_updates_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  CONSTRAINT fk_pos_order_updates_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
