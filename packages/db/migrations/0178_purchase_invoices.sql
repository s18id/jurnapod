-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0178_purchase_invoices
-- Story: Epic 46.5 - Purchase Invoice Schema Foundation (Scope B)
-- Description: Create purchase_invoices table for AP invoice tracking.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE IF NOT EXISTS `purchase_invoices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `company_id` BIGINT UNSIGNED NOT NULL,
  `supplier_id` INT NOT NULL,
  `invoice_no` VARCHAR(64) NOT NULL,
  `invoice_date` DATE NOT NULL,
  `due_date` DATE DEFAULT NULL,
  `reference_number` VARCHAR(64) DEFAULT NULL,
  `status` TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1=DRAFT, 2=POSTED, 3=VOID',
  `currency_code` CHAR(3) NOT NULL DEFAULT 'IDR',
  `exchange_rate` DECIMAL(18,8) NOT NULL DEFAULT 1.00000000,
  `subtotal` DECIMAL(19,4) NOT NULL DEFAULT 0.0000,
  `tax_amount` DECIMAL(19,4) NOT NULL DEFAULT 0.0000,
  `grand_total` DECIMAL(19,4) NOT NULL DEFAULT 0.0000,
  `notes` TEXT DEFAULT NULL,
  `journal_batch_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Links to reversal journal on void',
  `posted_at` DATETIME DEFAULT NULL,
  `posted_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `voided_at` DATETIME DEFAULT NULL,
  `voided_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `updated_by_user_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_purchase_invoices_company_invoice_no` (`company_id`, `invoice_no`),
  UNIQUE KEY `uk_purchase_invoices_company_reference` (`company_id`, `reference_number`),
  KEY `idx_purchase_invoices_company_status` (`company_id`, `status`),
  KEY `idx_purchase_invoices_company_invoice_date` (`company_id`, `invoice_date`),
  KEY `idx_purchase_invoices_supplier_id` (`supplier_id`),
  KEY `idx_purchase_invoices_company_supplier_status` (`company_id`, `supplier_id`, `status`),
  KEY `fk_purchase_invoices_journal_batch` (`journal_batch_id`),
  KEY `fk_purchase_invoices_posted_by_user` (`posted_by_user_id`),
  KEY `fk_purchase_invoices_voided_by_user` (`voided_by_user_id`),
  KEY `fk_purchase_invoices_created_by_user` (`created_by_user_id`),
  KEY `fk_purchase_invoices_updated_by_user` (`updated_by_user_id`),

  CONSTRAINT `fk_purchase_invoices_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_purchase_invoices_supplier` FOREIGN KEY (`company_id`, `supplier_id`) REFERENCES `suppliers` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_purchase_invoices_journal_batch` FOREIGN KEY (`journal_batch_id`) REFERENCES `journal_batches` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_purchase_invoices_posted_by_user` FOREIGN KEY (`posted_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_purchase_invoices_voided_by_user` FOREIGN KEY (`voided_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_purchase_invoices_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_purchase_invoices_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_purchase_invoices_status` CHECK (`status` IN (1, 2, 3)),
  CONSTRAINT `chk_purchase_invoices_subtotal_non_negative` CHECK (`subtotal` >= 0),
  CONSTRAINT `chk_purchase_invoices_tax_amount_non_negative` CHECK (`tax_amount` >= 0),
  CONSTRAINT `chk_purchase_invoices_grand_total_non_negative` CHECK (`grand_total` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
