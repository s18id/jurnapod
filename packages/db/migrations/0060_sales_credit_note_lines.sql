-- Migration: 0060_sales_credit_note_lines.sql
-- Generated from: 0000_version_1.sql
-- Table: sales_credit_note_lines
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `sales_credit_note_lines` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `credit_note_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `line_no` int(10) unsigned NOT NULL,
  `description` varchar(255) NOT NULL,
  `qty` decimal(18,4) NOT NULL,
  `unit_price` decimal(18,2) NOT NULL,
  `line_total` decimal(18,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_credit_note_lines_credit_note_line_no` (`credit_note_id`,`line_no`),
  KEY `idx_sales_credit_note_lines_company_created_at` (`company_id`,`created_at`),
  KEY `idx_sales_credit_note_lines_outlet_created_at` (`outlet_id`,`created_at`),
  KEY `idx_sales_credit_note_lines_scope_credit_note` (`company_id`,`outlet_id`,`credit_note_id`),
  CONSTRAINT `fk_sales_credit_note_lines_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_sales_credit_note_lines_credit_note_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `credit_note_id`) REFERENCES `sales_credit_notes` (`company_id`, `outlet_id`, `id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_credit_note_lines_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `chk_sales_credit_note_lines_qty_positive` CHECK (`qty` > 0),
  CONSTRAINT `chk_sales_credit_note_lines_unit_price_non_negative` CHECK (`unit_price` >= 0),
  CONSTRAINT `chk_sales_credit_note_lines_line_total_non_negative` CHECK (`line_total` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
