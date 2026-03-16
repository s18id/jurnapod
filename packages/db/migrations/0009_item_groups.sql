-- Migration: 0009_item_groups.sql
-- Generated from: 0000_version_1.sql
-- Table: item_groups
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `item_groups` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `parent_id` bigint(20) unsigned DEFAULT NULL,
  `code` varchar(64) DEFAULT NULL,
  `name` varchar(191) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_item_groups_company_code` (`company_id`,`code`),
  KEY `idx_item_groups_company_active` (`company_id`,`is_active`),
  KEY `idx_item_groups_company_updated` (`company_id`,`updated_at`),
  KEY `idx_item_groups_company_parent` (`company_id`,`parent_id`),
  KEY `fk_item_groups_parent` (`parent_id`),
  CONSTRAINT `fk_item_groups_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_item_groups_parent` FOREIGN KEY (`parent_id`) REFERENCES `item_groups` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
