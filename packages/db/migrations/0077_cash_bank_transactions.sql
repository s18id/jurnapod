-- Migration: 0077_cash_bank_transactions.sql
-- Generated from: 0000_version_1.sql
-- Table: cash_bank_transactions
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `cash_bank_transactions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `transaction_type` enum('MUTATION','TOP_UP','WITHDRAWAL','FOREX') NOT NULL,
  `transaction_date` date NOT NULL,
  `reference` varchar(100) DEFAULT NULL,
  `description` varchar(500) NOT NULL,
  `source_account_id` bigint(20) unsigned NOT NULL,
  `destination_account_id` bigint(20) unsigned NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `currency_code` varchar(3) NOT NULL DEFAULT 'IDR',
  `exchange_rate` decimal(18,8) DEFAULT NULL,
  `base_amount` decimal(18,2) DEFAULT NULL,
  `fx_gain_loss` decimal(18,2) DEFAULT 0.00,
  `fx_account_id` bigint(20) unsigned DEFAULT NULL,
  `status` enum('DRAFT','POSTED','VOID') NOT NULL DEFAULT 'DRAFT',
  `posted_at` datetime DEFAULT NULL,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cash_bank_tx_company_reference` (`company_id`,`reference`),
  KEY `idx_cash_bank_tx_company_date` (`company_id`,`transaction_date`),
  KEY `idx_cash_bank_tx_company_type` (`company_id`,`transaction_type`),
  KEY `idx_cash_bank_tx_company_status` (`company_id`,`status`),
  KEY `idx_cash_bank_tx_company_outlet_date` (`company_id`,`outlet_id`,`transaction_date`),
  KEY `idx_cash_bank_tx_company_source` (`company_id`,`source_account_id`),
  KEY `idx_cash_bank_tx_company_dest` (`company_id`,`destination_account_id`),
  KEY `idx_cash_bank_tx_company_fx` (`company_id`,`fx_account_id`),
  CONSTRAINT `fk_cash_bank_tx_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_cash_bank_tx_dest_account` FOREIGN KEY (`company_id`, `destination_account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `fk_cash_bank_tx_fx_account` FOREIGN KEY (`company_id`, `fx_account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `fk_cash_bank_tx_outlet` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `fk_cash_bank_tx_source_account` FOREIGN KEY (`company_id`, `source_account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `chk_cash_bank_tx_amount_positive` CHECK (`amount` > 0),
  CONSTRAINT `chk_cash_bank_tx_source_dest_diff` CHECK (`source_account_id` <> `destination_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
