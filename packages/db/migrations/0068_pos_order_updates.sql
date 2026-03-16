-- Migration: 0068_pos_order_updates.sql
-- Generated from: 0000_version_1.sql
-- Table: pos_order_updates
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `pos_order_updates` (
  `sequence_no` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `update_id` char(36) NOT NULL,
  `order_id` char(36) NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `base_order_updated_at` datetime DEFAULT NULL,
  `event_type` varchar(32) NOT NULL,
  `delta_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`delta_json`)),
  `actor_user_id` bigint(20) unsigned DEFAULT NULL,
  `device_id` varchar(191) NOT NULL,
  `event_at` datetime NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`sequence_no`),
  UNIQUE KEY `uq_pos_order_updates_update_id` (`update_id`),
  KEY `idx_pos_order_updates_scope_seq` (`company_id`,`outlet_id`,`sequence_no`),
  KEY `idx_pos_order_updates_scope_order_event` (`company_id`,`outlet_id`,`order_id`,`event_at`),
  KEY `fk_pos_order_updates_snapshot` (`order_id`),
  KEY `fk_pos_order_updates_outlet` (`outlet_id`),
  KEY `fk_pos_order_updates_actor` (`actor_user_id`),
  CONSTRAINT `fk_pos_order_updates_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_pos_order_updates_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_pos_order_updates_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_pos_order_updates_snapshot` FOREIGN KEY (`order_id`) REFERENCES `pos_order_snapshots` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_pos_order_updates_event_type` CHECK (`event_type` in ('SNAPSHOT_FINALIZED','ITEM_ADDED','ITEM_REMOVED','QTY_CHANGED','ITEM_CANCELLED','NOTES_CHANGED','ORDER_RESUMED','ORDER_CLOSED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
