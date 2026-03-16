-- Migration: 0067_pos_order_snapshot_lines.sql
-- Generated from: 0000_version_1.sql
-- Table: pos_order_snapshot_lines
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `pos_order_snapshot_lines` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `order_id` char(36) NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `item_id` bigint(20) unsigned NOT NULL,
  `sku_snapshot` varchar(191) DEFAULT NULL,
  `name_snapshot` varchar(191) NOT NULL,
  `item_type_snapshot` varchar(16) NOT NULL,
  `unit_price_snapshot` decimal(18,2) NOT NULL,
  `qty` decimal(18,4) NOT NULL,
  `discount_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `updated_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_order_snapshot_lines_order_item` (`order_id`,`item_id`),
  KEY `idx_pos_order_snapshot_lines_scope_order` (`company_id`,`outlet_id`,`order_id`),
  KEY `fk_pos_order_snapshot_lines_outlet` (`outlet_id`),
  CONSTRAINT `fk_pos_order_snapshot_lines_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_pos_order_snapshot_lines_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_pos_order_snapshot_lines_snapshot` FOREIGN KEY (`order_id`) REFERENCES `pos_order_snapshots` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_pos_order_snapshot_lines_item_type` CHECK (`item_type_snapshot` in ('SERVICE','PRODUCT','INGREDIENT','RECIPE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
