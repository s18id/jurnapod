-- Migration: 0017_backoffice_sync_queue.sql
-- Generated from: 0000_version_1.sql
-- Table: backoffice_sync_queue
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `backoffice_sync_queue` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `document_type` enum('INVOICE','PAYMENT','JOURNAL','REPORT','RECONCILIATION','SCHEDULED_EXPORT','FORECAST_GENERATION','INSIGHTS_CALCULATION') NOT NULL,
  `document_id` bigint(20) unsigned NOT NULL,
  `tier` enum('OPERATIONAL','MASTER','ADMIN','ANALYTICS') NOT NULL,
  `sync_status` enum('PENDING','PROCESSING','SUCCESS','FAILED') NOT NULL DEFAULT 'PENDING',
  `scheduled_at` datetime NOT NULL DEFAULT current_timestamp(),
  `processing_started_at` datetime DEFAULT NULL,
  `processed_at` datetime DEFAULT NULL,
  `retry_count` int(10) unsigned NOT NULL DEFAULT 0,
  `max_retries` int(10) unsigned NOT NULL DEFAULT 3,
  `error_message` text DEFAULT NULL,
  `payload_hash` varchar(64) DEFAULT NULL COMMENT 'SHA-256 hash for duplicate detection',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_backoffice_sync_document` (`company_id`,`document_type`,`document_id`,`payload_hash`),
  KEY `idx_backoffice_sync_queue_scheduled` (`scheduled_at`),
  KEY `idx_backoffice_sync_queue_retry` (`retry_count`,`max_retries`),
  KEY `idx_backoffice_sync_queue_document` (`document_type`,`document_id`),
  KEY `idx_backoffice_sync_queue_company_status` (`company_id`,`sync_status`),
  KEY `idx_backoffice_sync_queue_tier_status` (`tier`,`sync_status`),
  CONSTRAINT `backoffice_sync_queue_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
