-- Migration: 0028_email_outbox.sql
-- Generated from: 0000_version_1.sql
-- Table: email_outbox
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `email_outbox` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `to_email` varchar(191) NOT NULL,
  `subject` varchar(500) NOT NULL,
  `html` text NOT NULL,
  `text` text NOT NULL,
  `attachment_path` varchar(500) DEFAULT NULL,
  `status` enum('PENDING','SENDING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
  `error_message` text DEFAULT NULL,
  `attempts` int(10) unsigned NOT NULL DEFAULT 0,
  `next_retry_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `sent_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_email_outbox_status_next_retry` (`status`,`next_retry_at`),
  KEY `idx_email_outbox_company_id` (`company_id`),
  KEY `idx_email_outbox_created_at` (`created_at`),
  KEY `fk_email_outbox_user_id` (`user_id`),
  CONSTRAINT `fk_email_outbox_company_id` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_email_outbox_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
