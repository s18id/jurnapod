-- Migration: 0041_fixed_asset_events.sql
-- Generated from: 0000_version_1.sql
-- Table: fixed_asset_events
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `fixed_asset_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `asset_id` bigint(20) unsigned NOT NULL,
  `event_type` varchar(32) NOT NULL,
  `event_date` date NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `journal_batch_id` bigint(20) unsigned DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'POSTED',
  `idempotency_key` varchar(64) NOT NULL,
  `event_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`event_data`)),
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) unsigned NOT NULL,
  `voided_by` bigint(20) unsigned DEFAULT NULL,
  `voided_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fixed_asset_events_company_key` (`company_id`,`idempotency_key`),
  KEY `idx_fixed_asset_events_asset` (`asset_id`),
  KEY `idx_fixed_asset_events_company_date` (`company_id`,`event_date`),
  KEY `idx_fixed_asset_events_journal` (`journal_batch_id`),
  KEY `fk_fixed_asset_events_outlet` (`outlet_id`),
  KEY `fk_fixed_asset_events_created_by` (`created_by`),
  CONSTRAINT `fk_fixed_asset_events_asset` FOREIGN KEY (`asset_id`) REFERENCES `fixed_assets` (`id`),
  CONSTRAINT `fk_fixed_asset_events_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_fixed_asset_events_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_fixed_asset_events_journal` FOREIGN KEY (`journal_batch_id`) REFERENCES `journal_batches` (`id`),
  CONSTRAINT `fk_fixed_asset_events_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `chk_fixed_asset_events_status` CHECK (`status` in ('POSTED','VOIDED')),
  CONSTRAINT `chk_fixed_asset_events_type` CHECK (`event_type` in ('ACQUISITION','FA_ACQUISITION','DEPRECIATION','TRANSFER','IMPAIRMENT','DISPOSAL','FA_DISPOSAL','VOID'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
