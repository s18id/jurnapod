-- Migration: 0010_outlets.sql
-- Generated from: 0000_version_1.sql
-- Table: outlets
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `outlets` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `code` varchar(32) NOT NULL,
  `name` varchar(191) NOT NULL,
  `city` varchar(96) DEFAULT NULL,
  `address_line1` varchar(191) DEFAULT NULL,
  `address_line2` varchar(191) DEFAULT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `phone` varchar(32) DEFAULT NULL,
  `email` varchar(191) DEFAULT NULL,
  `timezone` varchar(64) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_outlets_company_code` (`company_id`,`code`),
  KEY `idx_outlets_company_id_id` (`company_id`,`id`),
  KEY `idx_outlets_company_is_active` (`company_id`,`is_active`),
  KEY `idx_outlets_company_city` (`company_id`,`city`),
  CONSTRAINT `fk_outlets_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
