-- Migration: 0100_story_12_1_review_fixes.sql
-- Purpose: Apply Story 12.1 review fixes on already-migrated environments
-- Compatibility: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;

-- ============================================================================
-- table_events: harden idempotency invariant
-- ============================================================================
SELECT COUNT(*) INTO @table_events_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events';

SELECT COUNT(*) INTO @table_events_client_tx_id_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events'
  AND COLUMN_NAME = 'client_tx_id';

SET @sql = IF(
  @table_events_exists = 1 AND @table_events_client_tx_id_exists = 1,
  'UPDATE table_events SET client_tx_id = CONCAT(''MIG0100-'', company_id, ''-'', outlet_id, ''-'', id) WHERE client_tx_id IS NULL OR TRIM(client_tx_id) = ''''',
  'SELECT ''Skipping table_events client_tx_id NULL/empty backfill'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @table_events_exists = 1 AND @table_events_client_tx_id_exists = 1,
  'UPDATE table_events te JOIN (SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id, outlet_id, client_tx_id ORDER BY id) AS rn FROM table_events WHERE client_tx_id IS NOT NULL AND TRIM(client_tx_id) <> '''') d ON d.id = te.id SET te.client_tx_id = CONCAT(LEFT(te.client_tx_id, 230), ''-DUP-'', te.id) WHERE d.rn > 1',
  'SELECT ''Skipping table_events duplicate client_tx_id normalization'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COALESCE(MAX(IS_NULLABLE = 'NO'), 0) INTO @table_events_client_tx_id_not_null
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events'
  AND COLUMN_NAME = 'client_tx_id';

SET @sql = IF(
  @table_events_exists = 1 AND @table_events_client_tx_id_exists = 1 AND @table_events_client_tx_id_not_null = 0,
  'ALTER TABLE table_events MODIFY COLUMN client_tx_id VARCHAR(255) NOT NULL COMMENT ''Client-generated transaction ID for idempotent sync (POS offline-first)''',
  'SELECT ''table_events.client_tx_id already NOT NULL or missing'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @uk_table_events_client_tx_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events'
  AND INDEX_NAME = 'uk_table_events_client_tx';

SET @sql = IF(
  @table_events_exists = 1 AND @uk_table_events_client_tx_exists = 0,
  'ALTER TABLE table_events ADD UNIQUE KEY uk_table_events_client_tx (company_id, outlet_id, client_tx_id)',
  'SELECT ''uk_table_events_client_tx already exists or table missing'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- table_occupancy: enforce service_session FK and integrity constraints
-- ============================================================================
SELECT COUNT(*) INTO @table_occupancy_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_occupancy';

SELECT COUNT(*) INTO @table_service_sessions_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions';

SET @sql = IF(
  @table_occupancy_exists = 1,
  'UPDATE table_occupancy SET status_id = 1, reserved_until = NULL, updated_by = COALESCE(updated_by, ''MIGRATION_0100'') WHERE status_id = 3 AND reservation_id IS NULL',
  'SELECT ''Skipping table_occupancy reserved integrity cleanup'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @table_occupancy_exists = 1,
  'UPDATE table_occupancy SET status_id = 1, service_session_id = NULL, occupied_at = NULL, updated_by = COALESCE(updated_by, ''MIGRATION_0100'') WHERE status_id = 2 AND service_session_id IS NULL',
  'SELECT ''Skipping table_occupancy occupied integrity cleanup'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @table_occupancy_exists = 1 AND @table_service_sessions_exists = 1,
  'UPDATE table_occupancy occ LEFT JOIN table_service_sessions tss ON tss.id = occ.service_session_id SET occ.service_session_id = NULL WHERE occ.service_session_id IS NOT NULL AND tss.id IS NULL',
  'SELECT ''Skipping table_occupancy service_session orphan cleanup'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @fk_table_occupancy_service_session_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_occupancy'
  AND CONSTRAINT_NAME = 'fk_table_occupancy_service_session'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @sql = IF(
  @table_occupancy_exists = 1 AND @table_service_sessions_exists = 1 AND @fk_table_occupancy_service_session_exists = 0,
  'ALTER TABLE table_occupancy ADD CONSTRAINT fk_table_occupancy_service_session FOREIGN KEY (service_session_id) REFERENCES table_service_sessions(id) ON DELETE SET NULL',
  'SELECT ''fk_table_occupancy_service_session already exists or required table missing'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DROP TRIGGER IF EXISTS trg_table_occupancy_integrity_bi;
CREATE TRIGGER trg_table_occupancy_integrity_bi
BEFORE INSERT ON table_occupancy
FOR EACH ROW
SET NEW.status_id = IF(
  (NEW.status_id = 3 AND NEW.reservation_id IS NULL)
  OR (NEW.status_id = 2 AND NEW.service_session_id IS NULL),
  NULL,
  NEW.status_id
);

DROP TRIGGER IF EXISTS trg_table_occupancy_integrity_bu;
CREATE TRIGGER trg_table_occupancy_integrity_bu
BEFORE UPDATE ON table_occupancy
FOR EACH ROW
SET NEW.status_id = IF(
  (NEW.status_id = 3 AND NEW.reservation_id IS NULL)
  OR (NEW.status_id = 2 AND NEW.service_session_id IS NULL),
  NULL,
  NEW.status_id
);

-- ============================================================================
-- table_service_sessions: lifecycle transition triggers
-- ============================================================================
DROP TRIGGER IF EXISTS trg_service_sessions_lifecycle_bi;
CREATE TRIGGER trg_service_sessions_lifecycle_bi
BEFORE INSERT ON table_service_sessions
FOR EACH ROW
SET NEW.status_id = IF(NEW.status_id = 1, NEW.status_id, NULL);

DROP TRIGGER IF EXISTS trg_service_sessions_lifecycle_bu;
CREATE TRIGGER trg_service_sessions_lifecycle_bu
BEFORE UPDATE ON table_service_sessions
FOR EACH ROW
SET NEW.status_id = IF(
  NEW.status_id = OLD.status_id
  OR (OLD.status_id = 1 AND NEW.status_id IN (2, 3)),
  NEW.status_id,
  NULL
);

SET FOREIGN_KEY_CHECKS=1;
