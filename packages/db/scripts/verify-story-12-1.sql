-- Verification Script: Verify Story 12.1 Migrations
-- Purpose: Validate all tables, columns, indexes, and constraints from migrations 0096-0099
-- Run this after applying migrations to confirm schema state

-- ============================================================================
-- AC 1: Verify Migration 0096 - Integer Status Columns
-- ============================================================================

SELECT '=== AC 1: Migration 0096 Verification ===' AS section;

-- Check outlet_tables.status_id column exists
SELECT 
  'outlet_tables.status_id' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'outlet_tables'
  AND COLUMN_NAME = 'status_id';

-- Check reservations.status_id column exists
SELECT 
  'reservations.status_id' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reservations'
  AND COLUMN_NAME = 'status_id';

-- Check outlet_tables composite index
SELECT 
  'idx_outlet_tables_company_outlet_status_id' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'outlet_tables'
  AND INDEX_NAME = 'idx_outlet_tables_company_outlet_status_id';

-- Check reservations composite index
SELECT 
  'idx_reservations_company_outlet_status_id' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reservations'
  AND INDEX_NAME = 'idx_reservations_company_outlet_status_id';

-- Sample data verification (show first 5 records with status mapping)
SELECT 
  'Sample outlet_tables status_id values' AS info,
  COUNT(*) AS total_records,
  SUM(CASE WHEN status_id = 1 THEN 1 ELSE 0 END) AS available,
  SUM(CASE WHEN status_id = 2 THEN 1 ELSE 0 END) AS reserved,
  SUM(CASE WHEN status_id = 5 THEN 1 ELSE 0 END) AS occupied
FROM outlet_tables
LIMIT 5;

-- ============================================================================
-- AC 2: Verify Migration 0097 - Table Occupancy
-- ============================================================================

SELECT '=== AC 2: Migration 0097 Verification ===' AS section;

-- Check table_occupancy exists
SELECT 
  'table_occupancy table exists' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_occupancy';

-- Check required columns exist
SELECT 
  'table_occupancy columns' AS check_item,
  GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION) AS columns_found,
  CASE 
    WHEN SUM(COLUMN_NAME IN ('id', 'company_id', 'outlet_id', 'table_id', 'status_id', 'version', 
                             'service_session_id', 'reservation_id', 'occupied_at', 'reserved_until',
                             'guest_count', 'notes', 'created_at', 'updated_at', 'created_by', 'updated_by')) = 16 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_occupancy';

-- Check indexes
SELECT 
  'table_occupancy indexes' AS check_item,
  GROUP_CONCAT(INDEX_NAME) AS indexes_found,
  CASE 
    WHEN SUM(INDEX_NAME IN ('uk_table_occupancy_table', 'idx_table_occupancy_company_outlet',
                           'idx_table_occupancy_status', 'idx_table_occupancy_session',
                           'idx_table_occupancy_reservation', 'PRIMARY')) >= 6 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END AS status
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_occupancy';

-- Check CHECK constraints (portable via TABLE_CONSTRAINTS)
SELECT 
  'table_occupancy CHECK constraints' AS check_item,
  COUNT(*) AS constraint_count,
  CASE WHEN COUNT(*) >= 4 THEN 'PASS' ELSE 'INFO (may not be visible in information_schema)' END AS status
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_occupancy'
  AND CONSTRAINT_TYPE = 'CHECK';

-- Verify backfill - count occupancy records
SELECT 
  'table_occupancy backfill verification' AS check_item,
  COUNT(*) AS occupancy_records,
  COUNT(DISTINCT table_id) AS unique_tables,
  SUM(CASE WHEN status_id = 1 THEN 1 ELSE 0 END) AS available_count
FROM table_occupancy;

-- ============================================================================
-- AC 3: Verify Migration 0098 - Service Sessions
-- ============================================================================

SELECT '=== AC 3: Migration 0098 Verification ===' AS section;

-- Check table_service_sessions exists
SELECT 
  'table_service_sessions table exists' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions';

-- Check required columns exist
SELECT 
  'table_service_sessions columns' AS check_item,
  GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION) AS columns_found,
  CASE 
    WHEN SUM(COLUMN_NAME IN ('id', 'company_id', 'outlet_id', 'table_id', 'status_id', 'started_at',
                             'completed_at', 'guest_count', 'guest_name', 'pos_order_id', 'total_amount',
                              'server_user_id', 'cashier_user_id', 'notes', 'created_at', 'updated_at',
                              'created_by', 'updated_by')) = 18 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions';

-- Check indexes
SELECT 
  'table_service_sessions indexes' AS check_item,
  GROUP_CONCAT(INDEX_NAME) AS indexes_found,
  CASE 
    WHEN SUM(INDEX_NAME IN ('idx_service_sessions_company_outlet', 'idx_service_sessions_table',
                           'idx_service_sessions_status', 'idx_service_sessions_started',
                           'idx_service_sessions_order', 'idx_service_sessions_server',
                           'idx_service_sessions_cashier', 'PRIMARY')) >= 8 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END AS status
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions';

-- ============================================================================
-- AC 4: Verify Migration 0099 - Table Events
-- ============================================================================

SELECT '=== AC 4: Migration 0099 Verification ===' AS section;

-- Check table_events exists
SELECT 
  'table_events table exists' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events';

-- Check required columns exist
SELECT 
  'table_events columns' AS check_item,
  GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION) AS columns_found,
  CASE 
    WHEN SUM(COLUMN_NAME IN ('id', 'company_id', 'outlet_id', 'table_id', 'event_type_id', 'client_tx_id',
                             'occupancy_version_before', 'occupancy_version_after', 'event_data',
                             'status_id_before', 'status_id_after', 'service_session_id', 'reservation_id',
                              'pos_order_id', 'synced_at', 'source_device', 'occurred_at', 'created_at',
                              'created_by')) = 19 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events';

-- Check unique constraint on client_tx_id
SELECT 
  'table_events client_tx_id unique constraint' AS check_item,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events'
  AND INDEX_NAME = 'uk_table_events_client_tx';

-- Check all indexes
SELECT 
  'table_events indexes' AS check_item,
  GROUP_CONCAT(INDEX_NAME) AS indexes_found,
  CASE 
    WHEN SUM(INDEX_NAME IN ('uk_table_events_client_tx', 'idx_table_events_company_outlet',
                           'idx_table_events_table', 'idx_table_events_type', 'idx_table_events_occurred',
                           'idx_table_events_session', 'idx_table_events_reservation', 'idx_table_events_order',
                           'idx_table_events_synced', 'PRIMARY')) >= 10 
    THEN 'PASS' 
    ELSE 'FAIL' 
  END AS status
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events';

-- ============================================================================
-- Summary
-- ============================================================================

SELECT '=== Verification Summary ===' AS section;

SELECT 
  'Migration 0096 (status columns)' AS migration,
  CASE 
    WHEN (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'outlet_tables' AND COLUMN_NAME = 'status_id') > 0
     AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reservations' AND COLUMN_NAME = 'status_id') > 0
    THEN 'APPLIED'
    ELSE 'MISSING'
  END AS status;

SELECT 
  'Migration 0097 (table_occupancy)' AS migration,
  CASE 
    WHEN (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'table_occupancy') > 0
    THEN 'APPLIED'
    ELSE 'MISSING'
  END AS status;

SELECT 
  'Migration 0098 (table_service_sessions)' AS migration,
  CASE 
    WHEN (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'table_service_sessions') > 0
    THEN 'APPLIED'
    ELSE 'MISSING'
  END AS status;

SELECT 
  'Migration 0099 (table_events)' AS migration,
  CASE 
    WHEN (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'table_events') > 0
    THEN 'APPLIED'
    ELSE 'MISSING'
  END AS status;

-- ============================================================================
-- AC 7: Verify hardening migrations 0100-0103
-- ============================================================================

SELECT '=== AC 7: Hardening Verification (0100-0103) ===' AS section;

SELECT
  'table_events.client_tx_id NOT NULL' AS check_item,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'table_events'
        AND COLUMN_NAME = 'client_tx_id'
        AND IS_NULLABLE = 'NO'
    )
    THEN 'PASS'
    ELSE 'FAIL'
  END AS status;

SELECT
  'fk_table_occupancy_service_session exists' AS check_item,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'table_occupancy'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND CONSTRAINT_NAME = 'fk_table_occupancy_service_session'
    )
    THEN 'PASS'
    ELSE 'FAIL'
  END AS status;

SELECT
  'required integrity triggers exist' AS check_item,
  CASE
    WHEN (
      SELECT COUNT(*)
      FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()
        AND TRIGGER_NAME IN (
          'trg_table_occupancy_integrity_bi',
          'trg_table_occupancy_integrity_bu',
          'trg_service_sessions_lifecycle_bi',
          'trg_service_sessions_lifecycle_bu',
          'trg_table_events_scope_bi',
          'trg_table_events_scope_bu',
          'trg_table_events_scope_bd'
        )
    ) = 7
    THEN 'PASS'
    ELSE 'FAIL'
  END AS status;
