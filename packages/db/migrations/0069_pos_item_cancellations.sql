-- Migration: 0069_pos_item_cancellations.sql
-- Generated from: 0000_version_1.sql
-- Table: pos_item_cancellations
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `pos_item_cancellations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `cancellation_id` char(36) NOT NULL,
  `update_id` char(36) DEFAULT NULL,
  `order_id` char(36) NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `item_id` bigint(20) unsigned NOT NULL,
  `cancelled_quantity` decimal(18,4) NOT NULL,
  `reason` varchar(500) NOT NULL,
  `cancelled_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `cancelled_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_item_cancellations_cancellation_id` (`cancellation_id`),
  KEY `idx_pos_item_cancellations_scope_order_time` (`company_id`,`outlet_id`,`order_id`,`cancelled_at`),
  KEY `idx_pos_item_cancellations_update_id` (`update_id`),
  KEY `fk_pos_item_cancellations_order_snapshot` (`order_id`),
  KEY `fk_pos_item_cancellations_outlet` (`outlet_id`),
  KEY `fk_pos_item_cancellations_actor` (`cancelled_by_user_id`),
  CONSTRAINT `fk_pos_item_cancellations_actor` FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_pos_item_cancellations_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_pos_item_cancellations_order_snapshot` FOREIGN KEY (`order_id`) REFERENCES `pos_order_snapshots` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pos_item_cancellations_order_update` FOREIGN KEY (`update_id`) REFERENCES `pos_order_updates` (`update_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pos_item_cancellations_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `chk_pos_item_cancellations_cancelled_quantity` CHECK (`cancelled_quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
