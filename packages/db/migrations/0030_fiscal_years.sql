-- Migration: 0030_fiscal_years.sql
-- Generated from: 0000_version_1.sql
-- Table: fiscal_years
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `fiscal_years` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `code` varchar(32) NOT NULL,
  `name` varchar(191) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'OPEN',
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fiscal_years_company_code` (`company_id`,`code`),
  KEY `idx_fiscal_years_company_status` (`company_id`,`status`),
  KEY `idx_fiscal_years_company_start_date` (`company_id`,`start_date`),
  KEY `fk_fiscal_years_created_by_user` (`created_by_user_id`),
  KEY `fk_fiscal_years_updated_by_user` (`updated_by_user_id`),
  CONSTRAINT `fk_fiscal_years_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_fiscal_years_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fiscal_years_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_fiscal_years_date_range` CHECK (`start_date` <= `end_date`),
  CONSTRAINT `chk_fiscal_years_status` CHECK (`status` in ('OPEN','CLOSED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
