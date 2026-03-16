-- Migration: 0046_company_tax_defaults.sql
-- Generated from: 0000_version_1.sql
-- Table: company_tax_defaults
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `company_tax_defaults` (
  `company_id` bigint(20) unsigned NOT NULL,
  `tax_rate_id` bigint(20) unsigned NOT NULL,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`company_id`,`tax_rate_id`),
  KEY `idx_company_tax_defaults_tax_rate` (`tax_rate_id`),
  KEY `fk_company_tax_defaults_created_by_user` (`created_by_user_id`),
  KEY `fk_company_tax_defaults_updated_by_user` (`updated_by_user_id`),
  CONSTRAINT `fk_company_tax_defaults_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_company_tax_defaults_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_company_tax_defaults_tax_rate` FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_company_tax_defaults_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
