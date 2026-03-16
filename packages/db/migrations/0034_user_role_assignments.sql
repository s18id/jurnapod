-- Migration: 0034_user_role_assignments.sql
-- Generated from: 0000_version_1.sql
-- Table: user_role_assignments
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `user_role_assignments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `role_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_role_outlet` (`user_id`,`outlet_id`,`role_id`),
  KEY `idx_user_role_assignments_user` (`user_id`),
  KEY `idx_user_role_assignments_outlet` (`outlet_id`),
  KEY `idx_user_role_assignments_role` (`role_id`),
  CONSTRAINT `fk_user_role_assignments_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_role_assignments_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_role_assignments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User role assignments: outlet_id=NULL for global roles, outlet_id=N for outlet-scoped roles';

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
