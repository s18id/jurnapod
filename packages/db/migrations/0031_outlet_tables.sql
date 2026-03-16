-- Migration: 0031_outlet_tables.sql
-- Generated from: 0000_version_1.sql
-- Table: outlet_tables
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `outlet_tables` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `code` varchar(32) NOT NULL,
  `name` varchar(191) NOT NULL,
  `zone` varchar(64) DEFAULT NULL,
  `capacity` int(10) unsigned DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'AVAILABLE',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_outlet_tables_outlet_code` (`company_id`,`outlet_id`,`code`),
  KEY `idx_outlet_tables_company_outlet_id` (`company_id`,`outlet_id`,`id`),
  KEY `idx_outlet_tables_company_outlet_status` (`company_id`,`outlet_id`,`status`),
  CONSTRAINT `fk_outlet_tables_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_outlet_tables_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `chk_outlet_tables_status` CHECK (`status` in ('AVAILABLE','RESERVED','OCCUPIED','UNAVAILABLE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
