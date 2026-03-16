-- Migration: 0005_auth_password_reset_throttles.sql
-- Generated from: 0000_version_1.sql
-- Table: auth_password_reset_throttles
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `auth_password_reset_throttles` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `key_hash` char(64) NOT NULL,
  `request_count` int(10) unsigned NOT NULL DEFAULT 0,
  `window_started_at` datetime NOT NULL,
  `last_ip` varchar(45) DEFAULT NULL,
  `last_user_agent` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_password_reset_throttles_key` (`key_hash`),
  KEY `idx_auth_password_reset_throttles_window` (`window_started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
