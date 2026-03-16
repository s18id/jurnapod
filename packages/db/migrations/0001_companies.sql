-- Migration: 0000_companies.sql
-- Generated from: 0000_version_1.sql
-- Table: companies
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `companies` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `name` varchar(191) NOT NULL,
  `legal_name` varchar(191) DEFAULT NULL,
  `tax_id` varchar(64) DEFAULT NULL,
  `email` varchar(191) DEFAULT NULL,
  `timezone` varchar(50) DEFAULT 'UTC',
  `currency_code` varchar(3) DEFAULT 'IDR',
  `phone` varchar(32) DEFAULT NULL,
  `address_line1` varchar(191) DEFAULT NULL,
  `address_line2` varchar(191) DEFAULT NULL,
  `city` varchar(96) DEFAULT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_companies_code` (`code`),
  KEY `idx_companies_deleted_at` (`deleted_at`),
  KEY `idx_companies_city` (`city`),
  KEY `idx_companies_timezone` (`timezone`),
  KEY `idx_companies_currency_code` (`currency_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
