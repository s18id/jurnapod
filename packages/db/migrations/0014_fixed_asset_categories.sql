-- Migration: 0014_fixed_asset_categories.sql
-- Generated from: 0000_version_1.sql
-- Table: fixed_asset_categories
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `fixed_asset_categories` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `code` varchar(64) NOT NULL,
  `name` varchar(191) NOT NULL,
  `depreciation_method` varchar(32) NOT NULL DEFAULT 'STRAIGHT_LINE',
  `useful_life_months` int(10) unsigned NOT NULL,
  `residual_value_pct` decimal(5,2) NOT NULL DEFAULT 0.00,
  `expense_account_id` bigint(20) unsigned DEFAULT NULL,
  `accum_depr_account_id` bigint(20) unsigned DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fixed_asset_categories_company_code` (`company_id`,`code`),
  KEY `idx_fixed_asset_categories_company_active` (`company_id`,`is_active`),
  KEY `idx_fixed_asset_categories_company_updated` (`company_id`,`updated_at`),
  KEY `idx_fixed_asset_categories_expense_account` (`company_id`,`expense_account_id`),
  KEY `idx_fixed_asset_categories_accum_account` (`company_id`,`accum_depr_account_id`),
  KEY `fk_fixed_asset_categories_expense_account` (`expense_account_id`),
  KEY `fk_fixed_asset_categories_accum_account` (`accum_depr_account_id`),
  CONSTRAINT `fk_fixed_asset_categories_accum_account` FOREIGN KEY (`accum_depr_account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_fixed_asset_categories_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_fixed_asset_categories_expense_account` FOREIGN KEY (`expense_account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `chk_fixed_asset_categories_useful_life_positive` CHECK (`useful_life_months` > 0),
  CONSTRAINT `chk_fixed_asset_categories_residual_pct_range` CHECK (`residual_value_pct` >= 0 and `residual_value_pct` <= 100),
  CONSTRAINT `chk_fixed_asset_categories_method` CHECK (`depreciation_method` in ('STRAIGHT_LINE','DECLINING_BALANCE','SUM_OF_YEARS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
