-- Migration: 0043_account_balances_current.sql
-- Generated from: 0000_version_1.sql
-- Table: account_balances_current
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `account_balances_current` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `account_id` bigint(20) unsigned NOT NULL,
  `as_of_date` date NOT NULL,
  `debit_total` decimal(18,2) NOT NULL DEFAULT 0.00,
  `credit_total` decimal(18,2) NOT NULL DEFAULT 0.00,
  `balance` decimal(18,2) NOT NULL DEFAULT 0.00,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_account_balances_current_company_account` (`company_id`,`account_id`),
  KEY `idx_account_balances_current_company_as_of` (`company_id`,`as_of_date`),
  KEY `fk_account_balances_current_account` (`account_id`),
  CONSTRAINT `fk_account_balances_current_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_account_balances_current_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
