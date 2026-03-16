-- Migration: 0072_scheduled_exports.sql
-- Generated from: 0000_version_1.sql
-- Table: scheduled_exports
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `scheduled_exports` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `name` varchar(255) NOT NULL,
  `report_type` enum('SALES','FINANCIAL','INVENTORY','AUDIT','POS_TRANSACTIONS','JOURNAL') NOT NULL,
  `export_format` enum('CSV','XLSX','JSON') NOT NULL DEFAULT 'CSV',
  `schedule_type` enum('DAILY','WEEKLY','MONTHLY','ONCE') NOT NULL,
  `schedule_config` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '{"hour": 0, "dayOfWeek": null, "dayOfMonth": null}' CHECK (json_valid(`schedule_config`)),
  `filters` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '{"dateRange": {start, end}, "outlets": [], "status": []}' CHECK (json_valid(`filters`)),
  `recipients` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '[{"email": "user@example.com", "type": "TO"}]' CHECK (json_valid(`recipients`)),
  `delivery_method` enum('EMAIL','DOWNLOAD','WEBHOOK') NOT NULL DEFAULT 'EMAIL',
  `webhook_url` varchar(500) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `last_run_at` datetime DEFAULT NULL,
  `next_run_at` datetime NOT NULL,
  `created_by_user_id` bigint(20) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_scheduled_exports_company` (`company_id`),
  KEY `idx_scheduled_exports_next_run` (`next_run_at`,`is_active`),
  KEY `idx_scheduled_exports_active` (`company_id`,`is_active`),
  KEY `created_by_user_id` (`created_by_user_id`),
  CONSTRAINT `scheduled_exports_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `scheduled_exports_ibfk_2` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
