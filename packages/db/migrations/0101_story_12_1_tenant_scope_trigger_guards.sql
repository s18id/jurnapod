-- Migration: 0101_story_12_1_tenant_scope_trigger_guards.sql
-- Purpose: Enforce tenant/outlet scope integrity on table-state entities
-- Compatibility: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;

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

SET FOREIGN_KEY_CHECKS=1;
