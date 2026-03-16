-- Migration: 0035_inventory_stock.sql
-- Generated from: 0000_version_1.sql
-- Table: inventory_stock
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `inventory_stock` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `product_id` bigint(20) unsigned NOT NULL,
  `quantity` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `reserved_quantity` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `available_quantity` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `outlet_id_is_null` tinyint(1) GENERATED ALWAYS AS (case when `outlet_id` is null then 1 else 0 end) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventory_stock_company_outlet_product` (`company_id`,`outlet_id`,`product_id`),
  UNIQUE KEY `uq_inventory_stock_company_wide` (`company_id`,`product_id`,`outlet_id_is_null`),
  KEY `idx_inventory_stock_company_product` (`company_id`,`product_id`),
  KEY `idx_inventory_stock_outlet` (`outlet_id`),
  KEY `idx_inventory_stock_company_updated` (`company_id`,`updated_at`),
  KEY `fk_inventory_stock_product` (`product_id`),
  CONSTRAINT `fk_inventory_stock_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_inventory_stock_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_inventory_stock_product` FOREIGN KEY (`product_id`) REFERENCES `items` (`id`),
  CONSTRAINT `chk_inventory_stock_quantity_non_negative` CHECK (`quantity` >= 0),
  CONSTRAINT `chk_inventory_stock_reserved_non_negative` CHECK (`reserved_quantity` >= 0),
  CONSTRAINT `chk_inventory_stock_available_non_negative` CHECK (`available_quantity` >= 0),
  CONSTRAINT `chk_inventory_stock_available_formula` CHECK (`available_quantity` = `quantity` - `reserved_quantity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
