-- Migration: 0074_sync_operations.sql
-- Generated from: 0000_version_1.sql
-- Table: sync_operations
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `sync_operations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL COMMENT 'NULL for backoffice operations',
  `sync_module` enum('POS','BACKOFFICE') NOT NULL,
  `tier` enum('REALTIME','OPERATIONAL','MASTER','ADMIN','ANALYTICS') NOT NULL,
  `operation_type` enum('PUSH','PULL','RECONCILE','BATCH') NOT NULL,
  `request_id` varchar(36) NOT NULL COMMENT 'UUID for correlation',
  `started_at` datetime NOT NULL DEFAULT current_timestamp(),
  `completed_at` datetime DEFAULT NULL,
  `status` enum('RUNNING','SUCCESS','FAILED','CANCELLED') NOT NULL DEFAULT 'RUNNING',
  `records_processed` int(10) unsigned DEFAULT NULL,
  `data_version_before` bigint(20) unsigned DEFAULT NULL,
  `data_version_after` bigint(20) unsigned DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `result_summary` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Additional operation metadata' CHECK (json_valid(`result_summary`)),
  `duration_ms` int(10) unsigned GENERATED ALWAYS AS (case when `completed_at` is not null then timestampdiff(MICROSECOND,`started_at`,`completed_at`) / 1000 else NULL end) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_sync_operations_request` (`request_id`),
  KEY `idx_sync_operations_company` (`company_id`),
  KEY `idx_sync_operations_outlet` (`outlet_id`),
  KEY `idx_sync_operations_module_tier` (`sync_module`,`tier`),
  KEY `idx_sync_operations_status` (`status`),
  KEY `idx_sync_operations_started` (`started_at`),
  KEY `idx_sync_operations_duration` (`duration_ms`),
  KEY `idx_sync_operations_completed` (`completed_at`),
  CONSTRAINT `sync_operations_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sync_operations_ibfk_2` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
