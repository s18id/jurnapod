-- Migration: 0004_auth_login_throttles.sql
-- Generated from: 0000_version_1.sql
-- Table: auth_login_throttles
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `auth_login_throttles` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `key_hash` char(64) NOT NULL,
  `failure_count` int(10) unsigned NOT NULL DEFAULT 0,
  `last_failed_at` datetime DEFAULT NULL,
  `last_ip` varchar(45) DEFAULT NULL,
  `last_user_agent` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_login_throttles_key` (`key_hash`),
  KEY `idx_auth_login_throttles_last_failed` (`last_failed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
