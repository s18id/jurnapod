-- Migration: 0032_item_prices.sql
-- Generated from: 0000_version_1.sql
-- Table: item_prices
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `item_prices` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL COMMENT 'NULL = company default price, non-NULL = outlet override',
  `item_id` bigint(20) unsigned NOT NULL,
  `price` decimal(18,2) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `scope_key` varchar(100) GENERATED ALWAYS AS (case when `outlet_id` is null then concat('default:',`company_id`,':',`item_id`) else concat('override:',`company_id`,':',`outlet_id`,':',`item_id`) end) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_item_prices_scope` (`scope_key`),
  KEY `idx_item_prices_company_updated` (`company_id`,`updated_at`),
  KEY `fk_item_prices_outlet` (`outlet_id`),
  KEY `fk_item_prices_item` (`item_id`),
  KEY `idx_item_prices_company_item` (`company_id`,`item_id`),
  KEY `idx_item_prices_company_outlet_fk` (`company_id`,`outlet_id`),
  KEY `idx_item_prices_outlet_item_active` (`company_id`,`outlet_id`,`item_id`,`is_active`),
  KEY `idx_item_prices_company_default_fallback` (`company_id`,`item_id`,`is_active`),
  CONSTRAINT `fk_item_prices_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_item_prices_company_item_scoped` FOREIGN KEY (`company_id`, `item_id`) REFERENCES `items` (`company_id`, `id`) ON DELETE CASCADE,
  CONSTRAINT `fk_item_prices_company_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `chk_item_prices_price_non_negative` CHECK (`price` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Item prices: outlet_id=NULL for company default, outlet_id=N for outlet override. Effective price resolution: override > default.';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
