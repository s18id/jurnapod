-- Migration: 0097_create_table_occupancy.sql
-- Purpose: Create table_occupancy for live table state with optimistic locking
-- Author: BMAD AI Agent (Winston/Architect)
-- Date: 2026-03-18
-- 
-- CRITICAL: This migration is RERUNNABLE and IDEMPOTENT for MySQL 8.0+ and MariaDB 10.2+
-- Run it multiple times safely - it checks existence before creating objects.

-- ============================================================================
-- TABLE: table_occupancy
-- Represents the current physical state of a table (available, occupied, reserved, cleaning)
-- ============================================================================

SET FOREIGN_KEY_CHECKS=0;

-- Check and create table_occupancy
SELECT COUNT(*) INTO @table_exists 
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'table_occupancy';

SET @create_table_occupancy = IF(@table_exists = 0,
  'CREATE TABLE table_occupancy (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NOT NULL,
    table_id BIGINT UNSIGNED NOT NULL COMMENT ''FK to outlet_tables.id'',
    
    -- Status tracking (integer constant from shared package)
    status_id INT UNSIGNED NOT NULL COMMENT ''1=available, 2=occupied, 3=reserved, 4=cleaning, 5=out_of_service'',
    
    -- Optimistic locking for multi-cashier concurrency
    version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT ''Incremented on every update for optimistic locking'',
    
    -- Context references (nullable - only set when relevant)
    service_session_id BIGINT UNSIGNED NULL COMMENT ''FK to table_service_sessions.id when occupied'',
    reservation_id BIGINT UNSIGNED NULL COMMENT ''FK to reservations.id when reserved'',
    
    -- Metadata
    occupied_at DATETIME NULL COMMENT ''When table became occupied'',
    reserved_until DATETIME NULL COMMENT ''Reservation expiry time'',
    guest_count INT UNSIGNED NULL COMMENT ''Number of guests currently seated'',
    notes TEXT NULL COMMENT ''Staff notes about current state'',
    
    -- Audit trail
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NULL COMMENT ''User/system that created this record'',
    updated_by VARCHAR(255) NULL COMMENT ''User/system that last updated this record'',
    
    PRIMARY KEY (id),
    UNIQUE KEY uk_table_occupancy_table (table_id) COMMENT ''One occupancy record per table'',
    KEY idx_table_occupancy_company_outlet (company_id, outlet_id),
    KEY idx_table_occupancy_status (status_id),
    KEY idx_table_occupancy_session (service_session_id),
    KEY idx_table_occupancy_reservation (reservation_id),
    
    CONSTRAINT fk_table_occupancy_company 
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_table_occupancy_outlet 
      FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    CONSTRAINT fk_table_occupancy_table 
      FOREIGN KEY (table_id) REFERENCES outlet_tables(id) ON DELETE CASCADE,
    CONSTRAINT fk_table_occupancy_reservation 
      FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
    
    -- Business logic constraints (simplified for MariaDB compatibility)
    CONSTRAINT chk_table_occupancy_status_range 
      CHECK (status_id BETWEEN 1 AND 5),
    CONSTRAINT chk_table_occupancy_version_positive 
      CHECK (version > 0),
    CONSTRAINT chk_table_occupancy_guest_count_positive 
      CHECK (guest_count IS NULL OR guest_count > 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
    COMMENT=''Current physical state of tables with optimistic locking for multi-cashier concurrency'';',
  'SELECT ''Table table_occupancy already exists'' AS msg;'
);

PREPARE stmt FROM @create_table_occupancy;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ensure FK to table_service_sessions is present when both tables exist
SELECT COUNT(*) INTO @table_occupancy_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_occupancy';

SELECT COUNT(*) INTO @table_service_sessions_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions';

SET @cleanup_orphan_session_refs = IF(
  @table_occupancy_exists = 1 AND @table_service_sessions_exists = 1,
  'UPDATE table_occupancy occ LEFT JOIN table_service_sessions tss ON tss.id = occ.service_session_id SET occ.service_session_id = NULL WHERE occ.service_session_id IS NOT NULL AND tss.id IS NULL',
  'SELECT ''Skipping service_session_id cleanup - required table missing'' AS msg;'
);

PREPARE stmt FROM @cleanup_orphan_session_refs;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @fk_table_occupancy_service_session_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_occupancy'
  AND CONSTRAINT_NAME = 'fk_table_occupancy_service_session'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @add_fk_table_occupancy_service_session = IF(
  @table_occupancy_exists = 1 AND @table_service_sessions_exists = 1 AND @fk_table_occupancy_service_session_exists = 0,
  'ALTER TABLE table_occupancy ADD CONSTRAINT fk_table_occupancy_service_session FOREIGN KEY (service_session_id) REFERENCES table_service_sessions(id) ON DELETE SET NULL',
  'SELECT ''fk_table_occupancy_service_session already exists or required table missing'' AS msg;'
);

PREPARE stmt FROM @add_fk_table_occupancy_service_session;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Data correction before adding integrity constraints on pre-existing installations
SET @fix_reserved_without_reservation = IF(
  @table_occupancy_exists = 1,
  'UPDATE table_occupancy SET status_id = 1, reserved_until = NULL, updated_by = COALESCE(updated_by, ''MIGRATION_0097'') WHERE status_id = 3 AND reservation_id IS NULL',
  'SELECT ''Skipping reserved integrity cleanup - table_occupancy missing'' AS msg;'
);

PREPARE stmt FROM @fix_reserved_without_reservation;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fix_occupied_without_session = IF(
  @table_occupancy_exists = 1,
  'UPDATE table_occupancy SET status_id = 1, service_session_id = NULL, occupied_at = NULL, updated_by = COALESCE(updated_by, ''MIGRATION_0097'') WHERE status_id = 2 AND service_session_id IS NULL',
  'SELECT ''Skipping occupied integrity cleanup - table_occupancy missing'' AS msg;'
);

PREPARE stmt FROM @fix_occupied_without_session;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DROP TRIGGER IF EXISTS trg_table_occupancy_integrity_bi;
CREATE TRIGGER trg_table_occupancy_integrity_bi
BEFORE INSERT ON table_occupancy
FOR EACH ROW
SET
  NEW.table_id = IF(
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
  ),
  NEW.status_id = IF(
    (NEW.status_id = 3 AND NEW.reservation_id IS NULL)
    OR (NEW.status_id = 2 AND NEW.service_session_id IS NULL),
    NULL,
    NEW.status_id
  );

DROP TRIGGER IF EXISTS trg_table_occupancy_integrity_bu;
CREATE TRIGGER trg_table_occupancy_integrity_bu
BEFORE UPDATE ON table_occupancy
FOR EACH ROW
SET
  NEW.table_id = IF(
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
  ),
  NEW.status_id = IF(
    (NEW.status_id = 3 AND NEW.reservation_id IS NULL)
    OR (NEW.status_id = 2 AND NEW.service_session_id IS NULL),
    NULL,
    NEW.status_id
  );

-- ============================================================================
-- INITIAL DATA POPULATION
-- Backfill occupancy records for all existing tables (status: available)
-- ============================================================================

SELECT COUNT(*) INTO @table_exists 
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'table_occupancy';

SET @backfill_occupancy = IF(@table_exists = 1,
  'INSERT IGNORE INTO table_occupancy (
    company_id, outlet_id, table_id, status_id, version, created_by, updated_by
  )
  SELECT 
    ot.company_id,
    ot.outlet_id,
    ot.id AS table_id,
    1 AS status_id, -- 1 = available (default state)
    1 AS version,
    ''MIGRATION_0097'' AS created_by,
    ''MIGRATION_0097'' AS updated_by
  FROM outlet_tables ot
  WHERE NOT EXISTS (
    SELECT 1 FROM table_occupancy occ WHERE occ.table_id = ot.id
  );',
  'SELECT ''Skipping backfill - table_occupancy does not exist'' AS msg;'
);

PREPARE stmt FROM @backfill_occupancy;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 
  'table_occupancy' AS table_name,
  COUNT(*) AS record_count,
  COUNT(DISTINCT table_id) AS unique_tables,
  SUM(CASE WHEN status_id = 1 THEN 1 ELSE 0 END) AS available_count,
  SUM(CASE WHEN status_id = 2 THEN 1 ELSE 0 END) AS occupied_count,
  SUM(CASE WHEN status_id = 3 THEN 1 ELSE 0 END) AS reserved_count
FROM table_occupancy;

SET FOREIGN_KEY_CHECKS=1;
