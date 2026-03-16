-- Migration: 0012_roles.sql
-- Generated from: 0000_version_1.sql
-- Table: roles
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `roles` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL,
  `name` varchar(191) NOT NULL,
  `is_global` tinyint(1) NOT NULL DEFAULT 0,
  `role_level` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `company_id` bigint(20) unsigned DEFAULT NULL COMMENT 'NULL = system role, non-NULL = custom company role',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_company_code` (`company_id`,`code`),
  KEY `idx_roles_company_id` (`company_id`),
  CONSTRAINT `fk_roles_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Roles: company_id=NULL for system roles, company_id=N for custom company roles. Unique within company.';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
