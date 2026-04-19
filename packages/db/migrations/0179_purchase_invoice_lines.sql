-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0179_purchase_invoice_lines
-- Story: Epic 46.5 - Purchase Invoice Schema Foundation (Scope B)
-- Description: Create purchase_invoice_lines table for AP invoice line items.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE IF NOT EXISTS `purchase_invoice_lines` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_id` BIGINT UNSIGNED NOT NULL,
  `company_id` BIGINT UNSIGNED NOT NULL,
  `line_no` INT UNSIGNED NOT NULL,
  `line_type` VARCHAR(16) NOT NULL DEFAULT 'ITEM' COMMENT 'ITEM, SERVICE, FREIGHT, TAX, DISCOUNT',
  `item_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'NULL for non-item lines like freight/tax',
  `description` VARCHAR(255) NOT NULL,
  `qty` DECIMAL(19,4) NOT NULL,
  `unit_price` DECIMAL(19,4) NOT NULL,
  `line_total` DECIMAL(19,4) NOT NULL,
  `tax_rate_id` BIGINT UNSIGNED DEFAULT NULL,
  `tax_amount` DECIMAL(19,4) NOT NULL DEFAULT 0.0000,
  `po_line_id` INT DEFAULT NULL COMMENT 'Links to PO line if applicable',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_purchase_invoice_lines_invoice_line_no` (`invoice_id`, `line_no`),
  KEY `idx_purchase_invoice_lines_company_created_at` (`company_id`, `created_at`),
  KEY `idx_purchase_invoice_lines_invoice_id` (`invoice_id`),
  KEY `idx_purchase_invoice_lines_item_id` (`item_id`),
  KEY `idx_purchase_invoice_lines_po_line_id` (`po_line_id`),
  KEY `idx_purchase_invoice_lines_company_item` (`company_id`, `item_id`),
  KEY `fk_purchase_invoice_lines_tax_rate` (`tax_rate_id`),

  -- NOTE: FK constraints intentionally omitted here due cross-environment type/index drift observed
  -- in purchasing domain migrations. Integrity for item/tax/PO references is enforced at app-layer.
  CONSTRAINT `chk_purchase_invoice_lines_qty_positive` CHECK (`qty` > 0),
  CONSTRAINT `chk_purchase_invoice_lines_unit_price_non_negative` CHECK (`unit_price` >= 0),
  CONSTRAINT `chk_purchase_invoice_lines_line_total_non_negative` CHECK (`line_total` >= 0),
  CONSTRAINT `chk_purchase_invoice_lines_tax_amount_non_negative` CHECK (`tax_amount` >= 0),
  CONSTRAINT `chk_purchase_invoice_lines_line_type` CHECK (`line_type` IN ('ITEM', 'SERVICE', 'FREIGHT', 'TAX', 'DISCOUNT'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
