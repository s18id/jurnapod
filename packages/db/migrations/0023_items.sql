-- Migration: 0023_items.sql
-- Generated from: 0000_version_1.sql
-- Table: items
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `sku` varchar(64) DEFAULT NULL,
  `name` varchar(191) NOT NULL,
  `item_type` varchar(16) NOT NULL,
  `item_group_id` bigint(20) unsigned DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `track_stock` tinyint(1) NOT NULL DEFAULT 0,
  `low_stock_threshold` decimal(15,4) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_items_company_sku` (`company_id`,`sku`),
  KEY `idx_items_company_active` (`company_id`,`is_active`),
  KEY `idx_items_company_updated` (`company_id`,`updated_at`),
  KEY `idx_items_company_id_id` (`company_id`,`id`),
  KEY `idx_items_company_active_id` (`company_id`,`is_active`,`id`),
  KEY `idx_items_company_group` (`company_id`,`item_group_id`),
  KEY `fk_items_group` (`item_group_id`),
  KEY `idx_items_track_stock` (`company_id`,`track_stock`),
  KEY `idx_items_low_stock_threshold` (`company_id`,`low_stock_threshold`),
  CONSTRAINT `fk_items_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_items_group` FOREIGN KEY (`item_group_id`) REFERENCES `item_groups` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_items_type` CHECK (`item_type` in ('SERVICE','PRODUCT','INGREDIENT','RECIPE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
