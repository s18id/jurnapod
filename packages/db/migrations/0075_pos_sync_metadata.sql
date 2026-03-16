-- Migration: 0075_pos_sync_metadata.sql
-- Generated from: 0000_version_1.sql
-- Table: pos_sync_metadata
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `pos_sync_metadata` (
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `tier` enum('REALTIME','OPERATIONAL','MASTER','ADMIN') NOT NULL,
  `last_sync_at` datetime DEFAULT NULL,
  `last_version` bigint(20) unsigned DEFAULT NULL,
  `sync_status` enum('OK','ERROR','STALE') NOT NULL DEFAULT 'OK',
  `error_message` text DEFAULT NULL,
  `sync_frequency_ms` int(10) unsigned DEFAULT NULL COMMENT 'Override default frequency for this outlet/tier',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`company_id`,`outlet_id`,`tier`),
  KEY `idx_pos_sync_metadata_company` (`company_id`),
  KEY `idx_pos_sync_metadata_outlet` (`outlet_id`),
  KEY `idx_pos_sync_metadata_status` (`sync_status`),
  KEY `idx_pos_sync_metadata_sync_at` (`last_sync_at`),
  CONSTRAINT `pos_sync_metadata_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pos_sync_metadata_ibfk_2` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
