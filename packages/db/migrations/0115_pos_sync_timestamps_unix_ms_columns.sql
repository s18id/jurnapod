-- Migration: 0115_pos_sync_timestamps_unix_ms_columns.sql
-- Description: Add BIGINT (unix milliseconds) columns for canonical timestamp storage
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Following: Canonical reservation time schema (unix milliseconds in BIGINT columns)
-- Note: Existing datetime columns remain for backward compatibility; new _ts columns are canonical

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ============================================================================
-- pos_order_updates: add canonical timestamp columns
-- ============================================================================
ALTER TABLE `pos_order_updates`
  ADD COLUMN `event_at_ts` bigint(20) NOT NULL AFTER `event_at`,
  ADD COLUMN `created_at_ts` bigint(20) NOT NULL AFTER `created_at`,
  ADD COLUMN `base_order_updated_at_ts` bigint(20) DEFAULT NULL AFTER `base_order_updated_at`;

-- ============================================================================
-- pos_item_cancellations: add canonical timestamp columns
-- ============================================================================
ALTER TABLE `pos_item_cancellations`
  ADD COLUMN `cancelled_at_ts` bigint(20) NOT NULL AFTER `cancelled_at`,
  ADD COLUMN `created_at_ts` bigint(20) NOT NULL AFTER `created_at`;

-- ============================================================================
-- pos_order_snapshots: add canonical timestamp columns
-- ============================================================================
ALTER TABLE `pos_order_snapshots`
  ADD COLUMN `opened_at_ts` bigint(20) NOT NULL AFTER `opened_at`,
  ADD COLUMN `closed_at_ts` bigint(20) DEFAULT NULL AFTER `closed_at`,
  ADD COLUMN `updated_at_ts` bigint(20) NOT NULL AFTER `updated_at`,
  ADD COLUMN `created_at_ts` bigint(20) NOT NULL AFTER `created_at`;

-- ============================================================================
-- pos_order_snapshot_lines: add canonical timestamp columns
-- ============================================================================
ALTER TABLE `pos_order_snapshot_lines`
  ADD COLUMN `updated_at_ts` bigint(20) NOT NULL AFTER `updated_at`,
  ADD COLUMN `created_at_ts` bigint(20) NOT NULL AFTER `created_at`;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
