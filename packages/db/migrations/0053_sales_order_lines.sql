-- Migration: 0053_sales_order_lines.sql
-- Generated from: 0000_version_1.sql
-- Table: sales_order_lines
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `sales_order_lines` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `line_no` int(10) unsigned NOT NULL,
  `line_type` varchar(16) NOT NULL DEFAULT 'SERVICE',
  `item_id` bigint(20) unsigned DEFAULT NULL,
  `description` varchar(255) NOT NULL,
  `qty` decimal(18,4) NOT NULL,
  `unit_price` decimal(18,2) NOT NULL,
  `line_total` decimal(18,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_order_lines_order_line_no` (`order_id`,`line_no`),
  KEY `idx_sales_order_lines_company_created_at` (`company_id`,`created_at`),
  KEY `idx_sales_order_lines_outlet_created_at` (`outlet_id`,`created_at`),
  KEY `idx_sales_order_lines_scope_order` (`company_id`,`outlet_id`,`order_id`),
  KEY `idx_sales_order_lines_item_id` (`item_id`),
  KEY `idx_sales_order_lines_company_item` (`company_id`,`item_id`),
  CONSTRAINT `fk_sales_order_lines_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_sales_order_lines_item` FOREIGN KEY (`company_id`, `item_id`) REFERENCES `items` (`company_id`, `id`),
  CONSTRAINT `fk_sales_order_lines_order_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `order_id`) REFERENCES `sales_orders` (`company_id`, `outlet_id`, `id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_order_lines_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `chk_sales_order_lines_qty_positive` CHECK (`qty` > 0),
  CONSTRAINT `chk_sales_order_lines_unit_price_non_negative` CHECK (`unit_price` >= 0),
  CONSTRAINT `chk_sales_order_lines_line_total_non_negative` CHECK (`line_total` >= 0),
  CONSTRAINT `chk_sales_order_lines_line_type` CHECK (`line_type` in ('SERVICE','PRODUCT')),
  CONSTRAINT `chk_sales_order_lines_product_item_required` CHECK (`line_type` <> 'PRODUCT' or `item_id` is not null)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
