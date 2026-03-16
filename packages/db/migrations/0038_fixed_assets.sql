-- Migration: 0038_fixed_assets.sql
-- Generated from: 0000_version_1.sql
-- Table: fixed_assets
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `fixed_assets` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `category_id` bigint(20) unsigned DEFAULT NULL,
  `asset_tag` varchar(64) DEFAULT NULL,
  `name` varchar(191) NOT NULL,
  `serial_number` varchar(128) DEFAULT NULL,
  `purchase_date` date DEFAULT NULL,
  `purchase_cost` decimal(18,2) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `disposed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fixed_assets_company_asset_tag` (`company_id`,`asset_tag`),
  KEY `idx_fixed_assets_company_outlet` (`company_id`,`outlet_id`),
  KEY `idx_fixed_assets_company_active` (`company_id`,`is_active`),
  KEY `idx_fixed_assets_company_updated` (`company_id`,`updated_at`),
  KEY `fk_fixed_assets_outlet` (`outlet_id`),
  KEY `idx_fixed_assets_company_category` (`company_id`,`category_id`),
  KEY `fk_fixed_assets_category` (`category_id`),
  KEY `idx_fixed_assets_disposed` (`disposed_at`),
  CONSTRAINT `fk_fixed_assets_category` FOREIGN KEY (`category_id`) REFERENCES `fixed_asset_categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fixed_assets_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_fixed_assets_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `chk_fixed_assets_purchase_cost_non_negative` CHECK (`purchase_cost` is null or `purchase_cost` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
