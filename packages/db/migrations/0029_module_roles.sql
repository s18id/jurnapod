-- Migration: 0029_module_roles.sql
-- Generated from: 0000_version_1.sql
-- Table: module_roles
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `module_roles` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `role_id` bigint(20) unsigned NOT NULL,
  `module` varchar(64) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `permission_mask` int(11) NOT NULL DEFAULT 0 COMMENT 'Permission bits: create=1, read=2, update=4, delete=8',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_module_roles_company_role_module` (`company_id`,`role_id`,`module`),
  KEY `idx_module_roles_module` (`module`),
  KEY `idx_module_roles_role_id` (`role_id`),
  KEY `idx_module_roles_company_module` (`company_id`,`module`),
  CONSTRAINT `fk_module_roles_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_module_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
