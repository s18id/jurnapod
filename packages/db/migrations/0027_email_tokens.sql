-- Migration: 0027_email_tokens.sql
-- Generated from: 0000_version_1.sql
-- Table: email_tokens
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `email_tokens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `email` varchar(191) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `type` enum('PASSWORD_RESET','INVITE','VERIFY_EMAIL') NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_token_hash` (`token_hash`),
  KEY `idx_email_tokens_user_id` (`user_id`),
  KEY `idx_email_tokens_company_id` (`company_id`),
  KEY `idx_email_tokens_expires_at` (`expires_at`),
  KEY `idx_email_tokens_type` (`type`),
  KEY `fk_email_tokens_created_by` (`created_by`),
  CONSTRAINT `fk_email_tokens_company_id` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_email_tokens_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_email_tokens_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
