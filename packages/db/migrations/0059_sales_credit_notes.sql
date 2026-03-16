-- Migration: 0059_sales_credit_notes.sql
-- Generated from: 0000_version_1.sql
-- Table: sales_credit_notes
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `sales_credit_notes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `invoice_id` bigint(20) unsigned NOT NULL,
  `credit_note_no` varchar(64) NOT NULL,
  `credit_note_date` date NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'DRAFT',
  `reason` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `client_ref` char(36) DEFAULT NULL,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_credit_notes_company_credit_note_no` (`company_id`,`credit_note_no`),
  UNIQUE KEY `uq_sales_credit_notes_company_client_ref` (`company_id`,`client_ref`),
  KEY `idx_sales_credit_notes_company_credit_note_date` (`company_id`,`credit_note_date`),
  KEY `idx_sales_credit_notes_outlet_credit_note_date` (`outlet_id`,`credit_note_date`),
  KEY `idx_sales_credit_notes_company_status` (`company_id`,`status`),
  KEY `idx_sales_credit_notes_scope_id` (`company_id`,`outlet_id`,`id`),
  KEY `idx_sales_credit_notes_invoice_id` (`invoice_id`),
  KEY `fk_sales_credit_notes_invoice_scoped` (`company_id`,`outlet_id`,`invoice_id`),
  KEY `fk_sales_credit_notes_created_by_user` (`created_by_user_id`),
  KEY `fk_sales_credit_notes_updated_by_user` (`updated_by_user_id`),
  CONSTRAINT `fk_sales_credit_notes_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_sales_credit_notes_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sales_credit_notes_invoice_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `invoice_id`) REFERENCES `sales_invoices` (`company_id`, `outlet_id`, `id`),
  CONSTRAINT `fk_sales_credit_notes_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `fk_sales_credit_notes_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_sales_credit_notes_status` CHECK (`status` in ('DRAFT','POSTED','VOID')),
  CONSTRAINT `chk_sales_credit_notes_amount_non_negative` CHECK (`amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
