-- Migration: 0026_auth_refresh_tokens.sql
-- Generated from: 0000_version_1.sql
-- Table: auth_refresh_tokens
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `auth_refresh_tokens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `rotated_from_id` bigint(20) unsigned DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_refresh_tokens_hash` (`token_hash`),
  KEY `idx_auth_refresh_tokens_user_expires` (`user_id`,`expires_at`),
  KEY `idx_auth_refresh_tokens_company_expires` (`company_id`,`expires_at`),
  KEY `idx_auth_refresh_tokens_rotated_from` (`rotated_from_id`),
  CONSTRAINT `fk_auth_refresh_tokens_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_auth_refresh_tokens_rotated_from` FOREIGN KEY (`rotated_from_id`) REFERENCES `auth_refresh_tokens` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_auth_refresh_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
