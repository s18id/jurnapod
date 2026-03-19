-- Migration: 0099_create_table_events.sql
-- Purpose: Create table_events append-only log for audit trail and POS sync
-- Author: BMAD AI Agent (Winston/Architect)
-- Date: 2026-03-18
-- 
-- CRITICAL: This migration is RERUNNABLE and IDEMPOTENT for MySQL 8.0+ and MariaDB 10.2+
-- Run it multiple times safely - it checks existence before creating objects.

-- ============================================================================
-- TABLE: table_events
-- Append-only event log for table state changes
-- Enables audit trail, sync replay, and multi-cashier conflict detection
-- ============================================================================

SET FOREIGN_KEY_CHECKS=0;

-- Check and create table_events
SELECT COUNT(*) INTO @table_exists 
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'table_events';

SET @create_table_events = IF(@table_exists = 0,
  'CREATE TABLE table_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NOT NULL,
    table_id BIGINT UNSIGNED NOT NULL COMMENT ''FK to outlet_tables.id'',
    
    -- Event classification
    event_type_id INT UNSIGNED NOT NULL COMMENT ''1=table_opened, 2=table_closed, 3=reservation_created, 4=reservation_confirmed, 5=reservation_cancelled, 6=status_changed, 7=guest_count_changed, 8=table_transferred'',
    
    -- Idempotency and versioning
    client_tx_id VARCHAR(255) NOT NULL COMMENT ''Client-generated transaction ID for idempotent sync (POS offline-first)'',
    occupancy_version_before INT UNSIGNED NULL COMMENT ''table_occupancy.version before this event'',
    occupancy_version_after INT UNSIGNED NULL COMMENT ''table_occupancy.version after this event'',
    
    -- Event payload (JSON for flexibility)
    event_data JSON NULL COMMENT ''Event-specific data: before/after state, reason, etc.'',
    
    -- Status tracking
    status_id_before INT UNSIGNED NULL COMMENT ''table_occupancy.status_id before event'',
    status_id_after INT UNSIGNED NULL COMMENT ''table_occupancy.status_id after event'',
    
    -- Context references
    service_session_id BIGINT UNSIGNED NULL COMMENT ''FK to table_service_sessions.id if applicable'',
    reservation_id BIGINT UNSIGNED NULL COMMENT ''FK to reservations.id if applicable'',
    pos_order_id CHAR(36) NULL COMMENT ''FK to pos_order_snapshots.order_id if applicable'',
    
    -- Sync metadata
    synced_at DATETIME NULL COMMENT ''When this event was synced from POS to server'',
    source_device VARCHAR(255) NULL COMMENT ''Device/cashier that generated this event'',
    
    -- Audit trail
    occurred_at DATETIME NOT NULL COMMENT ''When the event actually happened (may differ from created_at for offline events)'',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT ''When record was inserted into DB'',
    created_by VARCHAR(255) NULL COMMENT ''User/system that created this event'',
    
    PRIMARY KEY (id),
    UNIQUE KEY uk_table_events_client_tx (company_id, outlet_id, client_tx_id) COMMENT ''Idempotency constraint for POS sync'',
    KEY idx_table_events_company_outlet (company_id, outlet_id),
    KEY idx_table_events_table (table_id),
    KEY idx_table_events_type (event_type_id),
    KEY idx_table_events_occurred (occurred_at),
    KEY idx_table_events_session (service_session_id),
    KEY idx_table_events_reservation (reservation_id),
    KEY idx_table_events_order (pos_order_id),
    KEY idx_table_events_synced (synced_at),
    
    CONSTRAINT fk_table_events_company 
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_table_events_outlet 
      FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    CONSTRAINT fk_table_events_table 
      FOREIGN KEY (table_id) REFERENCES outlet_tables(id) ON DELETE CASCADE,
    CONSTRAINT fk_table_events_reservation 
      FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
    CONSTRAINT fk_table_events_order 
      FOREIGN KEY (pos_order_id) REFERENCES pos_order_snapshots(order_id) ON DELETE SET NULL,
    
    -- Business logic constraints (simplified for MariaDB compatibility)
    CONSTRAINT chk_table_events_type_range 
      CHECK (event_type_id BETWEEN 1 AND 8)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
    COMMENT=''Append-only event log for table state changes, audit trail, and POS sync'';',
  'SELECT ''Table table_events already exists'' AS msg;'
);

PREPARE stmt FROM @create_table_events;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Harden idempotency for pre-existing installations (NULL/empty client_tx_id bypass)
SELECT COUNT(*) INTO @table_events_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events';

SELECT COUNT(*) INTO @table_events_client_tx_id_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events'
  AND COLUMN_NAME = 'client_tx_id';

SET @backfill_client_tx_id = IF(
  @table_events_exists = 1 AND @table_events_client_tx_id_exists = 1,
  'UPDATE table_events SET client_tx_id = CONCAT(''MIG0099-'', company_id, ''-'', outlet_id, ''-'', id) WHERE client_tx_id IS NULL OR TRIM(client_tx_id) = ''''',
  'SELECT ''Skipping client_tx_id backfill - table/column missing'' AS msg;'
);

PREPARE stmt FROM @backfill_client_tx_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COALESCE(MAX(IS_NULLABLE = 'NO'), 0) INTO @table_events_client_tx_id_not_null
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events'
  AND COLUMN_NAME = 'client_tx_id';

SET @alter_client_tx_id_not_null = IF(
  @table_events_exists = 1 AND @table_events_client_tx_id_exists = 1 AND @table_events_client_tx_id_not_null = 0,
  'ALTER TABLE table_events MODIFY COLUMN client_tx_id VARCHAR(255) NOT NULL COMMENT ''Client-generated transaction ID for idempotent sync (POS offline-first)''',
  'SELECT ''table_events.client_tx_id already NOT NULL or missing'' AS msg;'
);

PREPARE stmt FROM @alter_client_tx_id_not_null;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ensure idempotency unique key exists on pre-existing installations
SELECT COUNT(*) INTO @uk_table_events_client_tx_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events'
  AND INDEX_NAME = 'uk_table_events_client_tx';

SET @add_uk_table_events_client_tx = IF(
  @table_events_exists = 1 AND @uk_table_events_client_tx_exists = 0,
  'ALTER TABLE table_events ADD UNIQUE KEY uk_table_events_client_tx (company_id, outlet_id, client_tx_id)',
  'SELECT ''uk_table_events_client_tx already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_uk_table_events_client_tx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DROP TRIGGER IF EXISTS trg_table_events_scope_bi;
CREATE TRIGGER trg_table_events_scope_bi
BEFORE INSERT ON table_events
FOR EACH ROW
SET NEW.table_id = IF(
  EXISTS (
    SELECT 1
    FROM outlet_tables ot
    WHERE ot.id = NEW.table_id
      AND ot.company_id = NEW.company_id
      AND ot.outlet_id = NEW.outlet_id
  )
  AND (
    NEW.reservation_id IS NULL OR EXISTS (
      SELECT 1
      FROM reservations r
      WHERE r.id = NEW.reservation_id
        AND r.company_id = NEW.company_id
        AND r.outlet_id = NEW.outlet_id
    )
  )
  AND (
    NEW.service_session_id IS NULL OR EXISTS (
      SELECT 1
      FROM table_service_sessions ss
      WHERE ss.id = NEW.service_session_id
        AND ss.company_id = NEW.company_id
        AND ss.outlet_id = NEW.outlet_id
        AND ss.table_id = NEW.table_id
    )
  ),
  NEW.table_id,
  NULL
);

DROP TRIGGER IF EXISTS trg_table_events_scope_bu;
CREATE TRIGGER trg_table_events_scope_bu
BEFORE UPDATE ON table_events
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'table_events is append-only: UPDATE is not allowed';

DROP TRIGGER IF EXISTS trg_table_events_scope_bd;
CREATE TRIGGER trg_table_events_scope_bd
BEFORE DELETE ON table_events
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'table_events is append-only: DELETE is not allowed';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SET @verify_table_events = IF(
  @table_events_exists = 1,
  'SELECT ''table_events'' AS table_name, COUNT(*) AS total_events, COUNT(DISTINCT table_id) AS tables_with_events, COUNT(DISTINCT client_tx_id) AS unique_transactions, SUM(CASE WHEN synced_at IS NOT NULL THEN 1 ELSE 0 END) AS synced_events, MIN(occurred_at) AS earliest_event, MAX(occurred_at) AS latest_event FROM table_events',
  'SELECT ''table_events'' AS table_name, 0 AS total_events, 0 AS tables_with_events, 0 AS unique_transactions, 0 AS synced_events, NULL AS earliest_event, NULL AS latest_event'
);

PREPARE stmt FROM @verify_table_events;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
