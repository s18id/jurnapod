-- Migration: 0065_pos_transaction_taxes.sql
-- Generated from: 0000_version_1.sql
-- Table: pos_transaction_taxes
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `pos_transaction_taxes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `pos_transaction_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `tax_rate_id` bigint(20) unsigned NOT NULL,
  `amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_transaction_taxes_tx_rate` (`pos_transaction_id`,`tax_rate_id`),
  KEY `idx_pos_transaction_taxes_company_outlet` (`company_id`,`outlet_id`),
  KEY `idx_pos_transaction_taxes_tax_rate` (`tax_rate_id`),
  CONSTRAINT `fk_pos_transaction_taxes_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_pos_transaction_taxes_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `fk_pos_transaction_taxes_tax_rate` FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates` (`id`),
  CONSTRAINT `fk_pos_transaction_taxes_tx` FOREIGN KEY (`pos_transaction_id`) REFERENCES `pos_transactions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_pos_transaction_taxes_amount_non_negative` CHECK (`amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
