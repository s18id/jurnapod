-- Migration: 0063_pos_transaction_items.sql
-- Generated from: 0000_version_1.sql
-- Table: pos_transaction_items
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `pos_transaction_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `pos_transaction_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `line_no` int(10) unsigned NOT NULL,
  `item_id` bigint(20) unsigned NOT NULL,
  `qty` decimal(18,4) NOT NULL,
  `price_snapshot` decimal(18,2) NOT NULL,
  `name_snapshot` varchar(191) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_transaction_items_tx_line` (`pos_transaction_id`,`line_no`),
  KEY `idx_pos_transaction_items_company_created_at` (`company_id`,`created_at`),
  KEY `idx_pos_transaction_items_outlet_created_at` (`outlet_id`,`created_at`),
  CONSTRAINT `fk_pos_transaction_items_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_pos_transaction_items_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_pos_transaction_items_tx` FOREIGN KEY (`pos_transaction_id`) REFERENCES `pos_transactions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
