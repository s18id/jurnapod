-- Migration: 0024_company_modules.sql
-- Generated from: 0000_version_1.sql
-- Table: company_modules
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `company_modules` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `module_id` bigint(20) unsigned NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 0,
  `config_json` longtext NOT NULL,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_company_modules_company_module` (`company_id`,`module_id`),
  KEY `idx_company_modules_company` (`company_id`),
  KEY `idx_company_modules_module` (`module_id`),
  KEY `fk_company_modules_created_by_user` (`created_by_user_id`),
  KEY `fk_company_modules_updated_by_user` (`updated_by_user_id`),
  CONSTRAINT `fk_company_modules_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_company_modules_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_company_modules_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`),
  CONSTRAINT `fk_company_modules_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_company_modules_config_json` CHECK (json_valid(`config_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
