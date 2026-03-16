-- Migration: 0025_auth_oauth_accounts.sql
-- Generated from: 0000_version_1.sql
-- Table: auth_oauth_accounts
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `auth_oauth_accounts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `provider` varchar(32) NOT NULL,
  `provider_user_id` varchar(191) NOT NULL,
  `email_snapshot` varchar(191) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_oauth_accounts_provider_user` (`provider`,`provider_user_id`,`company_id`),
  KEY `idx_auth_oauth_accounts_user` (`user_id`),
  KEY `idx_auth_oauth_accounts_company` (`company_id`),
  CONSTRAINT `fk_auth_oauth_accounts_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_auth_oauth_accounts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
