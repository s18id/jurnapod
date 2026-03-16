-- Migration: 0058_sales_payment_splits.sql
-- Generated from: 0000_version_1.sql
-- Table: sales_payment_splits
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `sales_payment_splits` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `payment_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `split_index` int(10) unsigned NOT NULL DEFAULT 0,
  `account_id` bigint(20) unsigned NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_payment_splits_payment_index` (`payment_id`,`split_index`),
  KEY `idx_sales_payment_splits_company_payment` (`company_id`,`payment_id`),
  KEY `idx_sales_payment_splits_outlet_payment` (`outlet_id`,`payment_id`),
  KEY `idx_sales_payment_splits_account` (`account_id`),
  KEY `idx_sales_payment_splits_scope_payment` (`company_id`,`outlet_id`,`payment_id`),
  KEY `fk_sales_payment_splits_account_scoped` (`company_id`,`account_id`),
  CONSTRAINT `fk_sales_payment_splits_account_scoped` FOREIGN KEY (`company_id`, `account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `fk_sales_payment_splits_payment_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `payment_id`) REFERENCES `sales_payments` (`company_id`, `outlet_id`, `id`) ON DELETE CASCADE,
  CONSTRAINT `chk_sales_payment_splits_amount_positive` CHECK (`amount` > 0),
  CONSTRAINT `chk_sales_payment_splits_split_index_range` CHECK (`split_index` between 0 and 9)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
