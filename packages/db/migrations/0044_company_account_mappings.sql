-- Migration: 0044_company_account_mappings.sql
-- Generated from: 0000_version_1.sql
-- Table: company_account_mappings
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `company_account_mappings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `mapping_key` varchar(64) NOT NULL,
  `account_id` bigint(20) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_company_account_mappings_key` (`company_id`,`mapping_key`),
  KEY `idx_company_account_mappings_account` (`company_id`,`account_id`),
  CONSTRAINT `fk_company_account_mappings_account` FOREIGN KEY (`company_id`, `account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `fk_company_account_mappings_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `chk_company_account_mappings_key` CHECK (`mapping_key` in ('AR','SALES_REVENUE','SALES_RETURNS','INVOICE_PAYMENT_BANK','PAYMENT_VARIANCE_GAIN','PAYMENT_VARIANCE_LOSS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
