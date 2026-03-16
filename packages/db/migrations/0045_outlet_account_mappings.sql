-- Migration: 0045_outlet_account_mappings.sql
-- Generated from: 0000_version_1.sql
-- Table: outlet_account_mappings
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `outlet_account_mappings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `mapping_key` varchar(64) NOT NULL,
  `account_id` bigint(20) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_outlet_account_mappings_scope_key` (`company_id`,`outlet_id`,`mapping_key`),
  KEY `idx_outlet_account_mappings_scope_account` (`company_id`,`outlet_id`,`account_id`),
  KEY `fk_outlet_account_mappings_account_scoped` (`company_id`,`account_id`),
  CONSTRAINT `fk_outlet_account_mappings_account_scoped` FOREIGN KEY (`company_id`, `account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `fk_outlet_account_mappings_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_outlet_account_mappings_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `chk_outlet_account_mappings_mapping_key` CHECK (`mapping_key` in ('CASH','QRIS','CARD','SALES_REVENUE','SALES_RETURNS','AR','INVOICE_PAYMENT_BANK'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
