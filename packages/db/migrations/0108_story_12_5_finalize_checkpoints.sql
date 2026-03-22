-- Migration: 0108_story_12_5_finalize_checkpoints.sql
-- Purpose: Add finalize checkpoint support for service sessions
-- Author: BMAD AI Agent
-- Date: 2026-03-19
--
-- CRITICAL: This migration is RERUNNABLE and IDEMPOTENT for MySQL 8.0+ and MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;

SELECT VERSION() LIKE '%MariaDB%' INTO @is_mariadb;

-- ============================================================================
-- UPDATE 1: table_service_sessions checkpoint columns
-- ============================================================================

SELECT COUNT(*) INTO @tss_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions';

SELECT COUNT(*) INTO @tss_session_version_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions'
  AND COLUMN_NAME = 'session_version';

SET @add_tss_session_version = IF(
  @tss_exists = 1 AND @tss_session_version_exists = 0,
  'ALTER TABLE table_service_sessions ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT ''Optimistic version for multi-cashier session updates'' AFTER reservation_id',
  'SELECT ''table_service_sessions.session_version already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_tss_session_version;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @tss_last_batch_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions'
  AND COLUMN_NAME = 'last_finalized_batch_no';

SET @add_tss_last_batch = IF(
  @tss_exists = 1 AND @tss_last_batch_exists = 0,
  'ALTER TABLE table_service_sessions ADD COLUMN last_finalized_batch_no INT UNSIGNED NOT NULL DEFAULT 0 COMMENT ''Last finalized checkpoint batch number'' AFTER session_version',
  'SELECT ''table_service_sessions.last_finalized_batch_no already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_tss_last_batch;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @idx_tss_version_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions'
  AND INDEX_NAME = 'idx_service_sessions_scope_version';

SET @add_idx_tss_version = IF(
  @tss_exists = 1 AND @idx_tss_version_exists = 0,
  'ALTER TABLE table_service_sessions ADD INDEX idx_service_sessions_scope_version (company_id, outlet_id, session_version)',
  'SELECT ''idx_service_sessions_scope_version already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_idx_tss_version;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- UPDATE 2: table_service_session_lines checkpoint and adjustment columns
-- ============================================================================

SELECT COUNT(*) INTO @tssl_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_session_lines';

SELECT COUNT(*) INTO @tssl_batch_no_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_session_lines'
  AND COLUMN_NAME = 'batch_no';

SET @add_tssl_batch_no = IF(
  @tssl_exists = 1 AND @tssl_batch_no_exists = 0,
  'ALTER TABLE table_service_session_lines ADD COLUMN batch_no INT UNSIGNED NULL COMMENT ''Finalize checkpoint batch number'' AFTER line_number',
  'SELECT ''table_service_session_lines.batch_no already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_tssl_batch_no;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @tssl_line_state_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_session_lines'
  AND COLUMN_NAME = 'line_state';

SET @add_tssl_line_state = IF(
  @tssl_exists = 1 AND @tssl_line_state_exists = 0,
  'ALTER TABLE table_service_session_lines ADD COLUMN line_state INT UNSIGNED NOT NULL DEFAULT 1 COMMENT ''1=OPEN, 2=FINALIZED, 3=VOIDED'' AFTER notes',
  'SELECT ''table_service_session_lines.line_state already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_tssl_line_state;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @tssl_adjustment_parent_exists
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_session_lines'
  AND COLUMN_NAME = 'adjustment_parent_line_id';

SET @add_tssl_adjustment_parent = IF(
  @tssl_exists = 1 AND @tssl_adjustment_parent_exists = 0,
  'ALTER TABLE table_service_session_lines ADD COLUMN adjustment_parent_line_id BIGINT UNSIGNED NULL COMMENT ''Parent line for adjustment audit chain'' AFTER void_reason',
  'SELECT ''table_service_session_lines.adjustment_parent_line_id already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_tssl_adjustment_parent;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @idx_tssl_batch_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_session_lines'
  AND INDEX_NAME = 'idx_session_lines_session_batch';

SET @add_idx_tssl_batch = IF(
  @tssl_exists = 1 AND @idx_tssl_batch_exists = 0,
  'ALTER TABLE table_service_session_lines ADD INDEX idx_session_lines_session_batch (session_id, batch_no)',
  'SELECT ''idx_session_lines_session_batch already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_idx_tssl_batch;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @idx_tssl_state_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_session_lines'
  AND INDEX_NAME = 'idx_session_lines_session_state';

SET @add_idx_tssl_state = IF(
  @tssl_exists = 1 AND @idx_tssl_state_exists = 0,
  'ALTER TABLE table_service_session_lines ADD INDEX idx_session_lines_session_state (session_id, line_state)',
  'SELECT ''idx_session_lines_session_state already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_idx_tssl_state;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @idx_tssl_adjustment_parent_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_session_lines'
  AND INDEX_NAME = 'idx_session_lines_adjustment_parent';

SET @add_idx_tssl_adjustment_parent = IF(
  @tssl_exists = 1 AND @idx_tssl_adjustment_parent_exists = 0,
  'ALTER TABLE table_service_session_lines ADD INDEX idx_session_lines_adjustment_parent (adjustment_parent_line_id)',
  'SELECT ''idx_session_lines_adjustment_parent already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_idx_tssl_adjustment_parent;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @fk_tssl_adjustment_parent_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_session_lines'
  AND CONSTRAINT_NAME = 'fk_session_lines_adjustment_parent'
  AND CONSTRAINT_TYPE = 'FOREIGN KEY';

SET @add_fk_tssl_adjustment_parent = IF(
  @tssl_exists = 1 AND @fk_tssl_adjustment_parent_exists = 0,
  'ALTER TABLE table_service_session_lines ADD CONSTRAINT fk_session_lines_adjustment_parent FOREIGN KEY (adjustment_parent_line_id) REFERENCES table_service_session_lines(id) ON DELETE SET NULL',
  'SELECT ''fk_session_lines_adjustment_parent already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_fk_tssl_adjustment_parent;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @chk_tssl_line_state_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_session_lines'
  AND CONSTRAINT_NAME = 'chk_session_lines_line_state';

SET @drop_chk_tssl_line_state = IF(
  @tssl_exists = 1 AND @chk_tssl_line_state_exists = 1,
  IF(@is_mariadb = 1,
    'ALTER TABLE table_service_session_lines DROP CONSTRAINT chk_session_lines_line_state',
    'ALTER TABLE table_service_session_lines DROP CHECK chk_session_lines_line_state'),
  'SELECT ''chk_session_lines_line_state does not exist or table missing'' AS msg;'
);

PREPARE stmt FROM @drop_chk_tssl_line_state;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @chk_tssl_line_state_exists_after_drop
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_session_lines'
  AND CONSTRAINT_NAME = 'chk_session_lines_line_state';

SET @add_chk_tssl_line_state = IF(
  @tssl_exists = 1 AND @chk_tssl_line_state_exists_after_drop = 0,
  'ALTER TABLE table_service_session_lines ADD CONSTRAINT chk_session_lines_line_state CHECK (line_state BETWEEN 1 AND 3)',
  'SELECT ''chk_session_lines_line_state already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_chk_tssl_line_state;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- UPDATE 3: table_service_session_checkpoints table
-- ============================================================================

SELECT COUNT(*) INTO @tssc_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_session_checkpoints';

SET @create_tssc = IF(
  @tssc_exists = 0,
  'CREATE TABLE table_service_session_checkpoints (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NOT NULL,
    session_id BIGINT UNSIGNED NOT NULL,
    batch_no INT UNSIGNED NOT NULL,
    snapshot_id CHAR(36) NOT NULL,
    finalized_at DATETIME NOT NULL,
    finalized_by VARCHAR(255) NULL,
    client_tx_id VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_session_checkpoint_batch (session_id, batch_no),
    UNIQUE KEY uk_session_checkpoint_client_tx (company_id, outlet_id, client_tx_id),
    KEY idx_session_checkpoint_scope_session_time (company_id, outlet_id, session_id, finalized_at),
    CONSTRAINT fk_session_checkpoint_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_checkpoint_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_checkpoint_session FOREIGN KEY (session_id) REFERENCES table_service_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_checkpoint_snapshot FOREIGN KEY (snapshot_id) REFERENCES pos_order_snapshots(order_id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT=''Checkpoint records for repeated order finalization before payment close''',
  'SELECT ''table_service_session_checkpoints already exists'' AS msg;'
);

PREPARE stmt FROM @create_tssc;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- UPDATE 4: Extend table_events event type range to support checkpoint events
-- ============================================================================

SELECT COUNT(*) INTO @te_exists
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events';

SELECT COUNT(*) INTO @chk_te_type_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events'
  AND CONSTRAINT_NAME = 'chk_table_events_type_range';

SET @drop_chk_te_type = IF(
  @te_exists = 1 AND @chk_te_type_exists = 1,
  IF(@is_mariadb = 1,
    'ALTER TABLE table_events DROP CONSTRAINT chk_table_events_type_range',
    'ALTER TABLE table_events DROP CHECK chk_table_events_type_range'),
  'SELECT ''chk_table_events_type_range does not exist or table missing'' AS msg;'
);

PREPARE stmt FROM @drop_chk_te_type;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @chk_te_type_exists_after_drop
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_events'
  AND CONSTRAINT_NAME = 'chk_table_events_type_range';

SET @add_chk_te_type = IF(
  @te_exists = 1 AND @chk_te_type_exists_after_drop = 0,
  'ALTER TABLE table_events ADD CONSTRAINT chk_table_events_type_range CHECK (event_type_id BETWEEN 1 AND 16)',
  'SELECT ''chk_table_events_type_range already exists or table missing'' AS msg;'
);

PREPARE stmt FROM @add_chk_te_type;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @update_te_comment = IF(
  @te_exists = 1,
  "ALTER TABLE table_events MODIFY COLUMN event_type_id INT UNSIGNED NOT NULL COMMENT '1=table_opened, 2=table_closed, 3=reservation_created, 4=reservation_confirmed, 5=reservation_cancelled, 6=status_changed, 7=guest_count_changed, 8=table_transferred, 9=session_line_added, 10=session_line_updated, 11=session_line_removed, 12=session_locked, 13=session_closed, 14=session_batch_finalized, 15=session_line_adjusted, 16=session_version_bumped'",
  'SELECT ''table_events missing - skipping event_type_id comment update'' AS msg;'
);

PREPARE stmt FROM @update_te_comment;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 'service session checkpoint columns' AS check_name,
       SUM(CASE WHEN COLUMN_NAME = 'session_version' THEN 1 ELSE 0 END) AS has_session_version,
       SUM(CASE WHEN COLUMN_NAME = 'last_finalized_batch_no' THEN 1 ELSE 0 END) AS has_last_finalized_batch_no
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_sessions'
  AND COLUMN_NAME IN ('session_version', 'last_finalized_batch_no');

SELECT 'service session line checkpoint columns' AS check_name,
       SUM(CASE WHEN COLUMN_NAME = 'batch_no' THEN 1 ELSE 0 END) AS has_batch_no,
       SUM(CASE WHEN COLUMN_NAME = 'line_state' THEN 1 ELSE 0 END) AS has_line_state,
       SUM(CASE WHEN COLUMN_NAME = 'adjustment_parent_line_id' THEN 1 ELSE 0 END) AS has_adjustment_parent_line_id
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_session_lines'
  AND COLUMN_NAME IN ('batch_no', 'line_state', 'adjustment_parent_line_id');

SELECT 'table_service_session_checkpoints exists' AS check_name,
       COUNT(*) AS table_count
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'table_service_session_checkpoints';

SET FOREIGN_KEY_CHECKS=1;
