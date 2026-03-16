-- Migration: 0039_fixed_asset_books.sql
-- Generated from: 0000_version_1.sql
-- Table: fixed_asset_books
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `fixed_asset_books` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `asset_id` bigint(20) unsigned NOT NULL,
  `cost_basis` decimal(18,2) NOT NULL DEFAULT 0.00,
  `accum_depreciation` decimal(18,2) NOT NULL DEFAULT 0.00,
  `accum_impairment` decimal(18,2) NOT NULL DEFAULT 0.00,
  `carrying_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `as_of_date` date NOT NULL,
  `last_event_id` bigint(20) unsigned NOT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fixed_asset_books_asset` (`asset_id`),
  KEY `idx_fixed_asset_books_company` (`company_id`),
  CONSTRAINT `fk_fixed_asset_books_asset` FOREIGN KEY (`asset_id`) REFERENCES `fixed_assets` (`id`),
  CONSTRAINT `fk_fixed_asset_books_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `chk_fixed_asset_books_non_negative` CHECK (`cost_basis` >= 0 and `accum_depreciation` >= 0 and `accum_impairment` >= 0 and `carrying_amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
