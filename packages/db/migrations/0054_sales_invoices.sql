-- Migration: 0054_sales_invoices.sql
-- Generated from: 0000_version_1.sql
-- Table: sales_invoices
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `sales_invoices` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `order_id` bigint(20) unsigned DEFAULT NULL,
  `invoice_no` varchar(64) NOT NULL,
  `invoice_date` date NOT NULL,
  `due_date` date DEFAULT NULL,
  `client_ref` char(36) DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'DRAFT',
  `payment_status` varchar(16) NOT NULL DEFAULT 'UNPAID',
  `subtotal` decimal(18,2) NOT NULL DEFAULT 0.00,
  `tax_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `grand_total` decimal(18,2) NOT NULL DEFAULT 0.00,
  `approved_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `paid_total` decimal(18,2) NOT NULL DEFAULT 0.00,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_invoices_company_invoice_no` (`company_id`,`invoice_no`),
  UNIQUE KEY `uq_sales_invoices_company_client_ref` (`company_id`,`client_ref`),
  KEY `idx_sales_invoices_company_invoice_date` (`company_id`,`invoice_date`),
  KEY `idx_sales_invoices_outlet_invoice_date` (`outlet_id`,`invoice_date`),
  KEY `idx_sales_invoices_company_payment_status` (`company_id`,`payment_status`),
  KEY `idx_sales_invoices_scope_id` (`company_id`,`outlet_id`,`id`),
  KEY `fk_sales_invoices_created_by_user` (`created_by_user_id`),
  KEY `fk_sales_invoices_updated_by_user` (`updated_by_user_id`),
  KEY `idx_sales_invoices_company_date_status` (`company_id`,`invoice_date`,`status`,`outlet_id`),
  KEY `idx_sales_invoices_company_outlet_date` (`company_id`,`outlet_id`,`invoice_date`,`status`),
  KEY `fk_sales_invoices_order_scoped` (`company_id`,`outlet_id`,`order_id`),
  KEY `idx_sales_invoices_approved_by_user_id` (`approved_by_user_id`),
  KEY `idx_sales_inv_ar_ageing` (`company_id`,`status`,`payment_status`,`due_date`,`outlet_id`),
  CONSTRAINT `fk_sales_invoices_approved_by_user` FOREIGN KEY (`approved_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sales_invoices_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_sales_invoices_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sales_invoices_order_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `order_id`) REFERENCES `sales_orders` (`company_id`, `outlet_id`, `id`),
  CONSTRAINT `fk_sales_invoices_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `fk_sales_invoices_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_sales_invoices_payment_status` CHECK (`payment_status` in ('UNPAID','PARTIAL','PAID')),
  CONSTRAINT `chk_sales_invoices_subtotal_non_negative` CHECK (`subtotal` >= 0),
  CONSTRAINT `chk_sales_invoices_tax_amount_non_negative` CHECK (`tax_amount` >= 0),
  CONSTRAINT `chk_sales_invoices_grand_total_non_negative` CHECK (`grand_total` >= 0),
  CONSTRAINT `chk_sales_invoices_paid_total_non_negative` CHECK (`paid_total` >= 0),
  CONSTRAINT `chk_sales_invoices_paid_total_lte_grand_total` CHECK (`paid_total` <= `grand_total`),
  CONSTRAINT `chk_sales_invoices_grand_total_formula` CHECK (`grand_total` = `subtotal` + `tax_amount`),
  CONSTRAINT `chk_sales_invoices_status` CHECK (`status` in ('DRAFT','APPROVED','POSTED','VOID'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
