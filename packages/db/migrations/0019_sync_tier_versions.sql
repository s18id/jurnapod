-- Migration: 0019_sync_tier_versions.sql
-- Generated from: 0000_version_1.sql
-- Table: sync_tier_versions
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `sync_tier_versions` (
  `company_id` bigint(20) unsigned NOT NULL,
  `tier` enum('REALTIME','OPERATIONAL','MASTER','ADMIN','ANALYTICS') NOT NULL,
  `current_version` bigint(20) unsigned NOT NULL DEFAULT 0,
  `last_updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`company_id`,`tier`),
  KEY `idx_sync_tier_versions_company` (`company_id`),
  KEY `idx_sync_tier_versions_updated` (`last_updated_at`),
  CONSTRAINT `sync_tier_versions_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
