-- Migration: 0073_export_files.sql
-- Generated from: 0000_version_1.sql
-- Table: export_files
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `export_files` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `scheduled_export_id` bigint(20) unsigned DEFAULT NULL,
  `batch_job_id` varchar(36) DEFAULT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_size` bigint(20) unsigned NOT NULL,
  `file_path` varchar(500) NOT NULL COMMENT 'Local path or S3 key',
  `storage_provider` enum('LOCAL','S3') NOT NULL DEFAULT 'LOCAL',
  `expires_at` datetime DEFAULT NULL,
  `download_count` int(10) unsigned NOT NULL DEFAULT 0,
  `last_downloaded_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_export_files_company` (`company_id`),
  KEY `idx_export_files_expires` (`expires_at`),
  KEY `idx_export_files_scheduled` (`scheduled_export_id`),
  CONSTRAINT `export_files_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `export_files_ibfk_2` FOREIGN KEY (`scheduled_export_id`) REFERENCES `scheduled_exports` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
