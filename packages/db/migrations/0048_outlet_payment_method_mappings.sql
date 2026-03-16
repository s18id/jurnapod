-- Migration: 0048_outlet_payment_method_mappings.sql
-- Generated from: 0000_version_1.sql
-- Table: outlet_payment_method_mappings
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `outlet_payment_method_mappings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `method_code` varchar(64) NOT NULL,
  `label` varchar(191) DEFAULT NULL,
  `account_id` bigint(20) unsigned NOT NULL,
  `is_invoice_default` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_outlet_payment_method_scope` (`company_id`,`outlet_id`,`method_code`),
  KEY `idx_outlet_payment_method_account` (`company_id`,`outlet_id`,`account_id`),
  KEY `fk_outlet_payment_method_account` (`company_id`,`account_id`),
  KEY `idx_outlet_payment_invoice_default` (`company_id`,`outlet_id`,`is_invoice_default`),
  CONSTRAINT `fk_outlet_payment_method_account` FOREIGN KEY (`company_id`, `account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `fk_outlet_payment_method_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_outlet_payment_method_outlet` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
