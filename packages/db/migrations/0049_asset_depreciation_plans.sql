-- Migration: 0049_asset_depreciation_plans.sql
-- Generated from: 0000_version_1.sql
-- Table: asset_depreciation_plans
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `asset_depreciation_plans` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `asset_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `method` varchar(32) NOT NULL DEFAULT 'STRAIGHT_LINE',
  `start_date` date NOT NULL,
  `useful_life_months` int(10) unsigned NOT NULL,
  `salvage_value` decimal(18,2) NOT NULL DEFAULT 0.00,
  `purchase_cost_snapshot` decimal(18,2) NOT NULL,
  `expense_account_id` bigint(20) unsigned NOT NULL,
  `accum_depr_account_id` bigint(20) unsigned NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'DRAFT',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_depr_plans_company_asset` (`company_id`,`asset_id`),
  KEY `fk_depr_plans_asset` (`asset_id`),
  KEY `fk_depr_plans_outlet` (`outlet_id`),
  KEY `fk_depr_plans_expense_account` (`expense_account_id`),
  KEY `fk_depr_plans_accum_account` (`accum_depr_account_id`),
  KEY `idx_depr_plans_company_asset_status` (`company_id`,`asset_id`,`status`,`id`),
  CONSTRAINT `fk_depr_plans_accum_account` FOREIGN KEY (`accum_depr_account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_depr_plans_asset` FOREIGN KEY (`asset_id`) REFERENCES `fixed_assets` (`id`),
  CONSTRAINT `fk_depr_plans_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_depr_plans_expense_account` FOREIGN KEY (`expense_account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_depr_plans_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `chk_depr_plans_status` CHECK (`status` in ('DRAFT','ACTIVE','VOID')),
  CONSTRAINT `chk_depr_plans_useful_life_positive` CHECK (`useful_life_months` > 0),
  CONSTRAINT `chk_depr_plans_salvage_non_negative` CHECK (`salvage_value` >= 0),
  CONSTRAINT `chk_depr_plans_purchase_cost_non_negative` CHECK (`purchase_cost_snapshot` >= 0),
  CONSTRAINT `chk_depr_plans_method` CHECK (`method` in ('STRAIGHT_LINE','DECLINING_BALANCE','SUM_OF_YEARS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
