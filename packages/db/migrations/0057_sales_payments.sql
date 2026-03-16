-- Migration: 0057_sales_payments.sql
-- Generated from: 0000_version_1.sql
-- Table: sales_payments
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `sales_payments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `invoice_id` bigint(20) unsigned NOT NULL,
  `account_id` bigint(20) unsigned NOT NULL,
  `payment_no` varchar(64) NOT NULL,
  `client_ref` char(36) DEFAULT NULL,
  `payment_at` datetime NOT NULL,
  `method` varchar(16) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'DRAFT',
  `amount` decimal(18,2) NOT NULL,
  `invoice_amount_idr` decimal(18,2) DEFAULT NULL,
  `payment_amount_idr` decimal(18,2) DEFAULT NULL,
  `payment_delta_idr` decimal(18,2) NOT NULL DEFAULT 0.00,
  `shortfall_settled_as_loss` tinyint(1) NOT NULL DEFAULT 0,
  `shortfall_reason` varchar(500) DEFAULT NULL,
  `shortfall_settled_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `shortfall_settled_at` datetime DEFAULT NULL,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_payments_company_payment_no` (`company_id`,`payment_no`),
  UNIQUE KEY `uq_sales_payments_company_client_ref` (`company_id`,`client_ref`),
  KEY `idx_sales_payments_company_payment_at` (`company_id`,`payment_at`),
  KEY `idx_sales_payments_outlet_payment_at` (`outlet_id`,`payment_at`),
  KEY `idx_sales_payments_company_status` (`company_id`,`status`),
  KEY `idx_sales_payments_company_invoice_status` (`company_id`,`invoice_id`,`status`),
  KEY `idx_sales_payments_scope_id` (`company_id`,`outlet_id`,`id`),
  KEY `idx_sales_payments_scope_invoice` (`company_id`,`outlet_id`,`invoice_id`),
  KEY `fk_sales_payments_created_by_user` (`created_by_user_id`),
  KEY `fk_sales_payments_updated_by_user` (`updated_by_user_id`),
  KEY `idx_sales_payments_account` (`account_id`),
  KEY `idx_sales_payments_company_invoice` (`company_id`,`invoice_id`,`payment_at`),
  KEY `idx_sales_payments_company_delta` (`company_id`,`payment_delta_idr`),
  KEY `idx_sales_payments_shortfall` (`company_id`,`shortfall_settled_as_loss`),
  CONSTRAINT `fk_sales_payments_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_sales_payments_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_sales_payments_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sales_payments_invoice_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `invoice_id`) REFERENCES `sales_invoices` (`company_id`, `outlet_id`, `id`),
  CONSTRAINT `fk_sales_payments_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `fk_sales_payments_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_sales_payments_status` CHECK (`status` in ('DRAFT','POSTED','VOID')),
  CONSTRAINT `chk_sales_payments_method` CHECK (`method` in ('CASH','QRIS','CARD')),
  CONSTRAINT `chk_sales_payments_amount_positive` CHECK (`amount` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
