-- Migration: 0007_sync_audit_events_archive.sql
-- Generated from: 0000_version_1.sql
-- Table: sync_audit_events_archive
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `sync_audit_events_archive` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `operation_type` varchar(20) NOT NULL,
  `tier_name` varchar(50) NOT NULL,
  `status` varchar(20) NOT NULL,
  `started_at` timestamp NOT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `duration_ms` int(10) unsigned DEFAULT NULL,
  `items_count` int(10) unsigned DEFAULT NULL,
  `version_before` bigint(20) unsigned DEFAULT NULL,
  `version_after` bigint(20) unsigned DEFAULT NULL,
  `error_code` varchar(50) DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `client_device_id` varchar(255) DEFAULT NULL,
  `client_version` varchar(50) DEFAULT NULL,
  `request_size_bytes` int(10) unsigned DEFAULT NULL,
  `response_size_bytes` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `archived_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_archive_company_time` (`company_id`,`created_at`),
  KEY `idx_archive_outlet_time` (`outlet_id`,`created_at`),
  KEY `idx_archive_operation` (`operation_type`,`status`),
  KEY `idx_archive_tier` (`tier_name`,`created_at`),
  KEY `idx_archive_status_time` (`status`,`created_at`),
  KEY `idx_archive_archived_at` (`archived_at`),
  CONSTRAINT `chk_archive_sync_audit_events_operation_type` CHECK (`operation_type` in ('PUSH','PULL','VERSION_BUMP','HEALTH_CHECK')),
  CONSTRAINT `chk_archive_sync_audit_events_tier_name` CHECK (`tier_name` in ('REALTIME','OPERATIONAL','MASTER','ADMIN','ANALYTICS','default')),
  CONSTRAINT `chk_archive_sync_audit_events_status` CHECK (`status` in ('SUCCESS','FAILED','PARTIAL','IN_PROGRESS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
