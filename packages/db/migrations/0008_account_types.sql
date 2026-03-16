-- Migration: 0008_account_types.sql
-- Generated from: 0000_version_1.sql
-- Table: account_types
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `account_types` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `name` varchar(191) NOT NULL COMMENT 'Account type name (e.g., Kas, Bank, Pendapatan)',
  `category` varchar(20) DEFAULT NULL COMMENT 'Standard account category: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE',
  `normal_balance` char(1) DEFAULT NULL COMMENT 'D=Debit, K=Kredit',
  `report_group` varchar(8) DEFAULT NULL COMMENT 'NRC=Neraca, PL=Laba Rugi',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_account_types_company_name` (`company_id`,`name`),
  KEY `idx_account_types_category` (`company_id`,`category`,`is_active`),
  CONSTRAINT `fk_account_types_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Account type definitions with normal balance and report group';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
