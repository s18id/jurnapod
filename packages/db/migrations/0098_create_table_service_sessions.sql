-- Migration: 0098_create_table_service_sessions.sql
-- Purpose: Create table_service_sessions for active dine-in service context
-- Author: BMAD AI Agent (Winston/Architect)
-- Date: 2026-03-18
-- 
-- CRITICAL: This migration is RERUNNABLE and IDEMPOTENT for MySQL 8.0+ and MariaDB 10.2+
-- Run it multiple times safely - it checks existence before creating objects.

-- ============================================================================
-- TABLE: table_service_sessions
-- Represents the commercial context of table occupancy (guests, orders, billing)
-- Links to pos_order_snapshots for financial transactions
-- ============================================================================

SET FOREIGN_KEY_CHECKS=0;

-- Check and create table_service_sessions
SELECT COUNT(*) INTO @table_exists 
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'table_service_sessions';

SET @create_table_service_sessions = IF(@table_exists = 0,
  'CREATE TABLE table_service_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NOT NULL,
    table_id BIGINT UNSIGNED NOT NULL COMMENT ''FK to outlet_tables.id'',
    
    -- Session lifecycle
    status_id INT UNSIGNED NOT NULL COMMENT ''1=active, 2=completed, 3=cancelled'',
    started_at DATETIME NOT NULL COMMENT ''When guests were seated'',
    completed_at DATETIME NULL COMMENT ''When service ended (payment completed or cancelled)'',
    
    -- Guest information
    guest_count INT UNSIGNED NOT NULL COMMENT ''Number of guests in party'',
    guest_name VARCHAR(255) NULL COMMENT ''Optional guest name for tracking'',
    
    -- Order tracking
    pos_order_id CHAR(36) NULL COMMENT ''FK to pos_order_snapshots.order_id - primary order for this session'',
    total_amount DECIMAL(15,4) NULL COMMENT ''Total bill amount (denormalized from order)'',
    
    -- Staff assignment
    server_user_id BIGINT UNSIGNED NULL COMMENT ''FK to users.id - assigned server'',
    cashier_user_id BIGINT UNSIGNED NULL COMMENT ''FK to users.id - cashier who opened session'',
    
    -- Session metadata
    notes TEXT NULL COMMENT ''Service notes, special requests, allergies, etc.'',
    
    -- Audit trail
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NULL COMMENT ''User/system that created this session'',
    updated_by VARCHAR(255) NULL COMMENT ''User/system that last updated this session'',
    
    PRIMARY KEY (id),
    KEY idx_service_sessions_company_outlet (company_id, outlet_id),
    KEY idx_service_sessions_table (table_id),
    KEY idx_service_sessions_status (status_id),
    KEY idx_service_sessions_started (started_at),
    KEY idx_service_sessions_order (pos_order_id),
    KEY idx_service_sessions_server (server_user_id),
    KEY idx_service_sessions_cashier (cashier_user_id),
    
    CONSTRAINT fk_service_sessions_company 
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_service_sessions_outlet 
      FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    CONSTRAINT fk_service_sessions_table 
      FOREIGN KEY (table_id) REFERENCES outlet_tables(id) ON DELETE CASCADE,
    CONSTRAINT fk_service_sessions_order 
      FOREIGN KEY (pos_order_id) REFERENCES pos_order_snapshots(order_id) ON DELETE SET NULL,
    CONSTRAINT fk_service_sessions_server 
      FOREIGN KEY (server_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_service_sessions_cashier 
      FOREIGN KEY (cashier_user_id) REFERENCES users(id) ON DELETE SET NULL,
    
    -- Business logic constraints (simplified for MariaDB compatibility)
    CONSTRAINT chk_service_sessions_status_range 
      CHECK (status_id BETWEEN 1 AND 3),
    CONSTRAINT chk_service_sessions_guest_count_positive 
      CHECK (guest_count > 0),
    CONSTRAINT chk_service_sessions_total_amount_nonnegative 
      CHECK (total_amount IS NULL OR total_amount >= 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
    COMMENT=''Commercial context of table occupancy - tracks guests, orders, and service'';',
  'SELECT ''Table table_service_sessions already exists'' AS msg;'
);

PREPARE stmt FROM @create_table_service_sessions;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ensure table_occupancy.service_session_id FK exists when both tables are present
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

-- Enforce lifecycle: status transition only ACTIVE(1) -> COMPLETED(2)/CANCELLED(3)
DROP TRIGGER IF EXISTS trg_service_sessions_lifecycle_bi;
CREATE TRIGGER trg_service_sessions_lifecycle_bi
BEFORE INSERT ON table_service_sessions
FOR EACH ROW
SET
  NEW.table_id = IF(
    EXISTS (
      SELECT 1
      FROM outlet_tables ot
      WHERE ot.id = NEW.table_id
        AND ot.company_id = NEW.company_id
        AND ot.outlet_id = NEW.outlet_id
    ),
    NEW.table_id,
    NULL
  ),
  NEW.status_id = IF(NEW.status_id = 1, NEW.status_id, NULL);

DROP TRIGGER IF EXISTS trg_service_sessions_lifecycle_bu;
CREATE TRIGGER trg_service_sessions_lifecycle_bu
BEFORE UPDATE ON table_service_sessions
FOR EACH ROW
SET
  NEW.table_id = IF(
    EXISTS (
      SELECT 1
      FROM outlet_tables ot
      WHERE ot.id = NEW.table_id
        AND ot.company_id = NEW.company_id
        AND ot.outlet_id = NEW.outlet_id
    ),
    NEW.table_id,
    NULL
  ),
  NEW.status_id = IF(
    NEW.status_id = OLD.status_id
    OR (OLD.status_id = 1 AND NEW.status_id IN (2, 3)),
    NEW.status_id,
    NULL
  );

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SET @verify_table_service_sessions = IF(
  @table_service_sessions_exists = 1,
  'SELECT ''table_service_sessions'' AS table_name, COUNT(*) AS total_sessions, SUM(CASE WHEN status_id = 1 THEN 1 ELSE 0 END) AS active_sessions, SUM(CASE WHEN status_id = 2 THEN 1 ELSE 0 END) AS completed_sessions, SUM(CASE WHEN status_id = 3 THEN 1 ELSE 0 END) AS cancelled_sessions, AVG(guest_count) AS avg_party_size FROM table_service_sessions',
  'SELECT ''table_service_sessions'' AS table_name, 0 AS total_sessions, 0 AS active_sessions, 0 AS completed_sessions, 0 AS cancelled_sessions, NULL AS avg_party_size'
);

PREPARE stmt FROM @verify_table_service_sessions;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;
