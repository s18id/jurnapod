-- Migration: 0022_accounts.sql
-- Generated from: 0000_version_1.sql
-- Table: accounts
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `accounts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `code` varchar(32) NOT NULL,
  `name` varchar(191) NOT NULL,
  `account_type_id` bigint(20) unsigned DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_payable` tinyint(1) NOT NULL DEFAULT 0,
  `type_name` varchar(191) DEFAULT NULL,
  `normal_balance` char(1) DEFAULT NULL,
  `report_group` varchar(8) DEFAULT NULL,
  `parent_account_id` bigint(20) unsigned DEFAULT NULL,
  `is_group` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_accounts_company_code` (`company_id`,`code`),
  KEY `idx_accounts_company_id_id` (`company_id`,`id`),
  KEY `idx_accounts_parent_account_id` (`parent_account_id`),
  KEY `idx_accounts_type` (`account_type_id`),
  KEY `idx_accounts_company_payable_active` (`company_id`,`is_payable`,`is_active`,`id`),
  CONSTRAINT `fk_accounts_account_type` FOREIGN KEY (`account_type_id`) REFERENCES `account_types` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_accounts_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_accounts_parent` FOREIGN KEY (`parent_account_id`) REFERENCES `accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
