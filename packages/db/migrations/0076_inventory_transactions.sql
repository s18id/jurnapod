-- Migration: 0076_inventory_transactions.sql
-- Generated from: 0000_version_1.sql
-- Table: inventory_transactions
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `inventory_transactions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `product_id` bigint(20) unsigned NOT NULL,
  `transaction_type` tinyint(3) unsigned NOT NULL COMMENT 'Transaction type: 1=SALE,2=REFUND,3=RESERVATION,4=RELEASE,5=ADJUSTMENT,6=RECEIPT,7=TRANSFER',
  `quantity_delta` decimal(15,4) NOT NULL,
  `reference_type` varchar(64) DEFAULT NULL,
  `reference_id` varchar(64) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_inventory_transactions_company_created` (`company_id`,`created_at`),
  KEY `idx_inventory_transactions_product_created` (`product_id`,`created_at`),
  KEY `idx_inventory_transactions_company_product` (`company_id`,`product_id`),
  KEY `idx_inventory_transactions_outlet` (`outlet_id`),
  KEY `idx_inventory_transactions_type` (`transaction_type`),
  KEY `idx_inventory_transactions_reference` (`reference_type`,`reference_id`),
  KEY `idx_inventory_transactions_created_by` (`created_by`),
  KEY `idx_inventory_transactions_company_type_created` (`company_id`,`transaction_type`,`created_at`),
  CONSTRAINT `fk_inventory_transactions_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_inventory_transactions_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_inventory_transactions_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_inventory_transactions_product` FOREIGN KEY (`product_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
