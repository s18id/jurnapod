-- Migration: 0015_supplies.sql
-- Generated from: 0000_version_1.sql
-- Table: supplies
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `supplies` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `sku` varchar(64) DEFAULT NULL,
  `name` varchar(191) NOT NULL,
  `unit` varchar(32) NOT NULL DEFAULT 'unit',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_supplies_company_sku` (`company_id`,`sku`),
  KEY `idx_supplies_company_active` (`company_id`,`is_active`),
  KEY `idx_supplies_company_updated` (`company_id`,`updated_at`),
  CONSTRAINT `fk_supplies_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
