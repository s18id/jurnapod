-- Migration: 0052_sales_orders.sql
-- Generated from: 0000_version_1.sql
-- Table: sales_orders
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `sales_orders` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `order_no` varchar(64) NOT NULL,
  `client_ref` char(36) DEFAULT NULL,
  `order_date` date NOT NULL,
  `expected_date` date DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'DRAFT',
  `notes` text DEFAULT NULL,
  `subtotal` decimal(18,2) NOT NULL DEFAULT 0.00,
  `tax_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `grand_total` decimal(18,2) NOT NULL DEFAULT 0.00,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `confirmed_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `confirmed_at` datetime DEFAULT NULL,
  `completed_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_orders_company_order_no` (`company_id`,`order_no`),
  UNIQUE KEY `uq_sales_orders_company_client_ref` (`company_id`,`client_ref`),
  KEY `idx_sales_orders_company_order_date` (`company_id`,`order_date`),
  KEY `idx_sales_orders_outlet_order_date` (`outlet_id`,`order_date`),
  KEY `idx_sales_orders_company_status` (`company_id`,`status`),
  KEY `idx_sales_orders_scope_id` (`company_id`,`outlet_id`,`id`),
  KEY `fk_sales_orders_created_by_user` (`created_by_user_id`),
  KEY `fk_sales_orders_updated_by_user` (`updated_by_user_id`),
  KEY `fk_sales_orders_confirmed_by_user` (`confirmed_by_user_id`),
  KEY `fk_sales_orders_completed_by_user` (`completed_by_user_id`),
  CONSTRAINT `fk_sales_orders_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_sales_orders_completed_by_user` FOREIGN KEY (`completed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sales_orders_confirmed_by_user` FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sales_orders_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sales_orders_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `fk_sales_orders_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_sales_orders_status` CHECK (`status` in ('DRAFT','CONFIRMED','COMPLETED','VOID')),
  CONSTRAINT `chk_sales_orders_subtotal_non_negative` CHECK (`subtotal` >= 0),
  CONSTRAINT `chk_sales_orders_tax_amount_non_negative` CHECK (`tax_amount` >= 0),
  CONSTRAINT `chk_sales_orders_grand_total_non_negative` CHECK (`grand_total` >= 0),
  CONSTRAINT `chk_sales_orders_grand_total_formula` CHECK (`grand_total` = `subtotal` + `tax_amount`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
