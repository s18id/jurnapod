-- Migration: 0064_pos_transaction_payments.sql
-- Generated from: 0000_version_1.sql
-- Table: pos_transaction_payments
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `pos_transaction_payments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `pos_transaction_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `payment_no` int(10) unsigned NOT NULL,
  `method` varchar(64) NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_transaction_payments_tx_payment` (`pos_transaction_id`,`payment_no`),
  KEY `idx_pos_transaction_payments_company_created_at` (`company_id`,`created_at`),
  KEY `idx_pos_transaction_payments_outlet_created_at` (`outlet_id`,`created_at`),
  CONSTRAINT `fk_pos_transaction_payments_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_pos_transaction_payments_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_pos_transaction_payments_tx` FOREIGN KEY (`pos_transaction_id`) REFERENCES `pos_transactions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
