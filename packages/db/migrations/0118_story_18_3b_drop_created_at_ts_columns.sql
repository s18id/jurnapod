-- Migration: 0118_story_18_3b_drop_created_at_ts_columns.sql
-- Description: Guarded drop of redundant created_at_ts columns after Epic 18 cleanup.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET @dropped := 0;

-- ============================================================================
-- pos_order_updates.created_at_ts
-- ============================================================================
SELECT COUNT(*) INTO @drop_updates_created_at_ts
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'pos_order_updates'
  AND COLUMN_NAME = 'created_at_ts';

SET @sql_drop_updates_created_at_ts = IF(
  @drop_updates_created_at_ts = 1,
  'ALTER TABLE `pos_order_updates` DROP COLUMN `created_at_ts`',
  'SELECT ''pos_order_updates.created_at_ts already dropped or table missing'' AS msg;'
);

PREPARE stmt FROM @sql_drop_updates_created_at_ts;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @dropped := @dropped + IF(@drop_updates_created_at_ts = 1, 1, 0);

-- ============================================================================
-- pos_order_snapshots.created_at_ts
-- ============================================================================
SELECT COUNT(*) INTO @drop_snapshots_created_at_ts
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'pos_order_snapshots'
  AND COLUMN_NAME = 'created_at_ts';

SET @sql_drop_snapshots_created_at_ts = IF(
  @drop_snapshots_created_at_ts = 1,
  'ALTER TABLE `pos_order_snapshots` DROP COLUMN `created_at_ts`',
  'SELECT ''pos_order_snapshots.created_at_ts already dropped or table missing'' AS msg;'
);

PREPARE stmt FROM @sql_drop_snapshots_created_at_ts;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @dropped := @dropped + IF(@drop_snapshots_created_at_ts = 1, 1, 0);

-- ============================================================================
-- pos_order_snapshot_lines.created_at_ts
-- ============================================================================
SELECT COUNT(*) INTO @drop_snapshot_lines_created_at_ts
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'pos_order_snapshot_lines'
  AND COLUMN_NAME = 'created_at_ts';

SET @sql_drop_snapshot_lines_created_at_ts = IF(
  @drop_snapshot_lines_created_at_ts = 1,
  'ALTER TABLE `pos_order_snapshot_lines` DROP COLUMN `created_at_ts`',
  'SELECT ''pos_order_snapshot_lines.created_at_ts already dropped or table missing'' AS msg;'
);

PREPARE stmt FROM @sql_drop_snapshot_lines_created_at_ts;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @dropped := @dropped + IF(@drop_snapshot_lines_created_at_ts = 1, 1, 0);

-- ============================================================================
-- pos_item_cancellations.created_at_ts
-- ============================================================================
SELECT COUNT(*) INTO @drop_cancellations_created_at_ts
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'pos_item_cancellations'
  AND COLUMN_NAME = 'created_at_ts';

SET @sql_drop_cancellations_created_at_ts = IF(
  @drop_cancellations_created_at_ts = 1,
  'ALTER TABLE `pos_item_cancellations` DROP COLUMN `created_at_ts`',
  'SELECT ''pos_item_cancellations.created_at_ts already dropped or table missing'' AS msg;'
);

PREPARE stmt FROM @sql_drop_cancellations_created_at_ts;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @dropped := @dropped + IF(@drop_cancellations_created_at_ts = 1, 1, 0);

SELECT CONCAT('Story 18.3b guarded drop: ', @dropped, ' created_at_ts column(s) dropped') AS migration_summary;
