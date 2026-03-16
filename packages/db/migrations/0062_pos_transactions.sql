-- Migration: 0062_pos_transactions.sql
-- Generated from: 0000_version_1.sql
-- Table: pos_transactions
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `pos_transactions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `cashier_user_id` bigint(20) unsigned DEFAULT NULL,
  `client_tx_id` char(36) NOT NULL,
  `status` varchar(16) NOT NULL,
  `trx_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `payload_sha256` char(64) NOT NULL DEFAULT '',
  `payload_hash_version` tinyint(3) unsigned NOT NULL DEFAULT 1,
  `service_type` varchar(16) NOT NULL DEFAULT 'TAKEAWAY',
  `table_id` bigint(20) unsigned DEFAULT NULL,
  `reservation_id` bigint(20) unsigned DEFAULT NULL,
  `guest_count` int(10) unsigned DEFAULT NULL,
  `order_status` varchar(16) NOT NULL DEFAULT 'COMPLETED',
  `opened_at` datetime DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `discount_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `discount_fixed` decimal(18,2) NOT NULL DEFAULT 0.00,
  `discount_code` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_transactions_client_tx_id` (`company_id`,`client_tx_id`),
  KEY `idx_pos_transactions_outlet_trx_at` (`outlet_id`,`trx_at`),
  KEY `idx_pos_transactions_company_trx_status` (`company_id`,`trx_at`,`status`,`id`),
  KEY `idx_pos_transactions_company_outlet_trx` (`company_id`,`outlet_id`,`trx_at`,`status`),
  KEY `idx_pos_transactions_company_outlet_cashier_trx` (`company_id`,`outlet_id`,`cashier_user_id`,`trx_at`,`id`),
  KEY `fk_pos_transactions_cashier_user` (`cashier_user_id`),
  KEY `idx_pos_transactions_company_outlet_service` (`company_id`,`outlet_id`,`service_type`,`trx_at`,`id`),
  KEY `idx_pos_transactions_company_outlet_reservation` (`company_id`,`outlet_id`,`reservation_id`),
  KEY `idx_pos_transactions_company_outlet_table` (`company_id`,`outlet_id`,`table_id`),
  KEY `idx_pos_transactions_discounts` (`company_id`,`trx_at`),
  CONSTRAINT `fk_pos_transactions_cashier_user` FOREIGN KEY (`cashier_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pos_transactions_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_pos_transactions_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_pos_transactions_reservation_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `reservation_id`) REFERENCES `reservations` (`company_id`, `outlet_id`, `id`),
  CONSTRAINT `fk_pos_transactions_table_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `table_id`) REFERENCES `outlet_tables` (`company_id`, `outlet_id`, `id`),
  CONSTRAINT `chk_pos_transactions_status` CHECK (`status` in ('COMPLETED','VOID','REFUND')),
  CONSTRAINT `chk_pos_transactions_service_type` CHECK (`service_type` in ('TAKEAWAY','DINE_IN')),
  CONSTRAINT `chk_pos_transactions_order_status` CHECK (`order_status` in ('OPEN','READY_TO_PAY','COMPLETED','CANCELLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
