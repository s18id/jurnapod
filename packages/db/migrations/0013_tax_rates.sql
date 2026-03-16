-- Migration: 0013_tax_rates.sql
-- Generated from: 0000_version_1.sql
-- Table: tax_rates
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `tax_rates` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `code` varchar(64) NOT NULL,
  `name` varchar(191) NOT NULL,
  `rate_percent` decimal(9,4) NOT NULL DEFAULT 0.0000,
  `account_id` bigint(20) unsigned DEFAULT NULL,
  `is_inclusive` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tax_rates_company_code` (`company_id`,`code`),
  KEY `idx_tax_rates_company_active` (`company_id`,`is_active`),
  KEY `fk_tax_rates_created_by_user` (`created_by_user_id`),
  KEY `fk_tax_rates_updated_by_user` (`updated_by_user_id`),
  KEY `idx_tax_rates_company_account` (`company_id`,`account_id`),
  CONSTRAINT `fk_tax_rates_account` FOREIGN KEY (`company_id`, `account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `fk_tax_rates_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_tax_rates_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tax_rates_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_tax_rates_rate_percent` CHECK (`rate_percent` >= 0 and `rate_percent` <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
