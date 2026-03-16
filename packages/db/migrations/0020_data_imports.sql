-- Migration: 0020_data_imports.sql
-- Generated from: 0000_version_1.sql
-- Table: data_imports
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `data_imports` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `accounts_file_name` varchar(255) NOT NULL,
  `transactions_file_name` varchar(255) NOT NULL,
  `allocations_file_name` varchar(255) NOT NULL,
  `file_hash` char(64) NOT NULL,
  `status` varchar(16) NOT NULL,
  `counts_json` longtext DEFAULT NULL,
  `error_json` longtext DEFAULT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_data_imports_company_hash` (`company_id`,`file_hash`),
  KEY `fk_data_imports_created_by` (`created_by`),
  CONSTRAINT `fk_data_imports_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_data_imports_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_data_imports_counts_json` CHECK (`counts_json` is null or json_valid(`counts_json`)),
  CONSTRAINT `chk_data_imports_error_json` CHECK (`error_json` is null or json_valid(`error_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
