-- Migration: 0051_fixed_asset_disposals.sql
-- Generated from: 0000_version_1.sql
-- Table: fixed_asset_disposals
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `fixed_asset_disposals` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned NOT NULL,
  `asset_id` bigint(20) unsigned NOT NULL,
  `proceeds` decimal(18,2) NOT NULL DEFAULT 0.00,
  `cost_removed` decimal(18,2) NOT NULL DEFAULT 0.00,
  `depr_removed` decimal(18,2) NOT NULL DEFAULT 0.00,
  `impairment_removed` decimal(18,2) NOT NULL DEFAULT 0.00,
  `disposal_cost` decimal(18,2) NOT NULL DEFAULT 0.00,
  `gain_loss` decimal(18,2) NOT NULL,
  `disposal_type` varchar(16) NOT NULL,
  `notes` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_fixed_asset_disposals_event` (`event_id`),
  KEY `idx_fixed_asset_disposals_asset` (`asset_id`),
  KEY `fk_fixed_asset_disposals_company` (`company_id`),
  CONSTRAINT `fk_fixed_asset_disposals_asset` FOREIGN KEY (`asset_id`) REFERENCES `fixed_assets` (`id`),
  CONSTRAINT `fk_fixed_asset_disposals_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_fixed_asset_disposals_event` FOREIGN KEY (`event_id`) REFERENCES `fixed_asset_events` (`id`),
  CONSTRAINT `chk_fixed_asset_disposals_type` CHECK (`disposal_type` in ('SALE','SCRAP'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
