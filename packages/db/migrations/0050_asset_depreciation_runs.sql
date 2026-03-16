-- Migration: 0050_asset_depreciation_runs.sql
-- Generated from: 0000_version_1.sql
-- Table: asset_depreciation_runs
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `asset_depreciation_runs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `plan_id` bigint(20) unsigned NOT NULL,
  `period_year` int(10) unsigned NOT NULL,
  `period_month` tinyint(3) unsigned NOT NULL,
  `run_date` date NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `journal_batch_id` bigint(20) unsigned DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'POSTED',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_depr_runs_plan_period` (`plan_id`,`period_year`,`period_month`),
  KEY `idx_depr_runs_company_period` (`company_id`,`period_year`,`period_month`),
  KEY `idx_depr_runs_company_status` (`company_id`,`status`),
  KEY `fk_depr_runs_journal_batch` (`journal_batch_id`),
  KEY `idx_depr_runs_plan_status` (`plan_id`,`status`,`period_year`,`period_month`),
  CONSTRAINT `fk_depr_runs_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_depr_runs_journal_batch` FOREIGN KEY (`journal_batch_id`) REFERENCES `journal_batches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_depr_runs_plan` FOREIGN KEY (`plan_id`) REFERENCES `asset_depreciation_plans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_depr_runs_period_month` CHECK (`period_month` between 1 and 12),
  CONSTRAINT `chk_depr_runs_amount_non_negative` CHECK (`amount` >= 0),
  CONSTRAINT `chk_depr_runs_status` CHECK (`status` in ('POSTED','VOID'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
