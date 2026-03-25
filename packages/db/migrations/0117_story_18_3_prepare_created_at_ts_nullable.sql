-- Migration: 0117_story_18_3_prepare_created_at_ts_nullable.sql
-- Description: Prepare redundant created_at_ts columns for nullable DEFAULT NULL
--              and ensure pos_order_updates.created_at is DB-owned.
--              This is Part 1 of Epic 18.3 (preparatory step) - run BEFORE Story 18.1 code cleanup.
--              The guarded DROP comes in Story 18.3b after Stories 18.1/18.2 complete.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET @prepared := 0;

-- ============================================================================
-- pos_order_updates.created_at: ensure DB-owned ingest timestamp default
-- ============================================================================
SELECT COUNT(*) INTO @updates_created_at_missing_default
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'pos_order_updates'
  AND COLUMN_NAME = 'created_at'
  AND COLUMN_DEFAULT IS NULL;

SET @sql_updates_created_at = IF(
  @updates_created_at_missing_default = 1,
  'ALTER TABLE `pos_order_updates` MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT ''pos_order_updates.created_at already has default or table missing'' AS msg;'
);

PREPARE stmt FROM @sql_updates_created_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @prepared := @prepared + IF(@updates_created_at_missing_default = 1, 1, 0);

-- ============================================================================
-- pos_order_updates.created_at_ts: make nullable with DEFAULT NULL
-- ============================================================================
SELECT COUNT(*) INTO @updates_created_at_ts_needs_prepare
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'pos_order_updates'
  AND COLUMN_NAME = 'created_at_ts'
  AND IS_NULLABLE = 'NO';

SET @sql_updates_created_at_ts = IF(
  @updates_created_at_ts_needs_prepare = 1,
  'ALTER TABLE `pos_order_updates` MODIFY COLUMN `created_at_ts` bigint(20) DEFAULT NULL',
  'SELECT ''pos_order_updates.created_at_ts already nullable/defaulted or table missing'' AS msg;'
);

PREPARE stmt FROM @sql_updates_created_at_ts;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @prepared := @prepared + IF(@updates_created_at_ts_needs_prepare = 1, 1, 0);

-- ============================================================================
-- pos_order_snapshots.created_at_ts: make nullable with DEFAULT NULL
-- ============================================================================
SELECT COUNT(*) INTO @snapshots_created_at_ts_needs_prepare
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'pos_order_snapshots'
  AND COLUMN_NAME = 'created_at_ts'
  AND IS_NULLABLE = 'NO';

SET @sql_snapshots_created_at_ts = IF(
  @snapshots_created_at_ts_needs_prepare = 1,
  'ALTER TABLE `pos_order_snapshots` MODIFY COLUMN `created_at_ts` bigint(20) DEFAULT NULL',
  'SELECT ''pos_order_snapshots.created_at_ts already nullable/defaulted or table missing'' AS msg;'
);

PREPARE stmt FROM @sql_snapshots_created_at_ts;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @prepared := @prepared + IF(@snapshots_created_at_ts_needs_prepare = 1, 1, 0);

-- ============================================================================
-- pos_order_snapshot_lines.created_at_ts: make nullable with DEFAULT NULL
-- ============================================================================
SELECT COUNT(*) INTO @snapshot_lines_created_at_ts_needs_prepare
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'pos_order_snapshot_lines'
  AND COLUMN_NAME = 'created_at_ts'
  AND IS_NULLABLE = 'NO';

SET @sql_snapshot_lines_created_at_ts = IF(
  @snapshot_lines_created_at_ts_needs_prepare = 1,
  'ALTER TABLE `pos_order_snapshot_lines` MODIFY COLUMN `created_at_ts` bigint(20) DEFAULT NULL',
  'SELECT ''pos_order_snapshot_lines.created_at_ts already nullable/defaulted or table missing'' AS msg;'
);

PREPARE stmt FROM @sql_snapshot_lines_created_at_ts;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @prepared := @prepared + IF(@snapshot_lines_created_at_ts_needs_prepare = 1, 1, 0);

-- ============================================================================
-- pos_item_cancellations.created_at_ts: make nullable with DEFAULT NULL
-- ============================================================================
SELECT COUNT(*) INTO @cancellations_created_at_ts_needs_prepare
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'pos_item_cancellations'
  AND COLUMN_NAME = 'created_at_ts'
  AND IS_NULLABLE = 'NO';

SET @sql_cancellations_created_at_ts = IF(
  @cancellations_created_at_ts_needs_prepare = 1,
  'ALTER TABLE `pos_item_cancellations` MODIFY COLUMN `created_at_ts` bigint(20) DEFAULT NULL',
  'SELECT ''pos_item_cancellations.created_at_ts already nullable/defaulted or table missing'' AS msg;'
);

PREPARE stmt FROM @sql_cancellations_created_at_ts;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @prepared := @prepared + IF(@cancellations_created_at_ts_needs_prepare = 1, 1, 0);

SELECT CONCAT('Story 18.3 preparatory: ', @prepared, ' column/default change(s) applied') AS migration_summary;
