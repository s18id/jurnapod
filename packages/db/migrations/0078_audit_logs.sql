-- Migration: 0078_audit_logs.sql
-- Generated from: 0000_version_1.sql
-- Table: audit_logs
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `audit_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned DEFAULT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `entity_type` varchar(64) DEFAULT NULL COMMENT 'Entity type: account, account_type, item, invoice, etc.',
  `entity_id` varchar(128) DEFAULT NULL COMMENT 'ID of the affected entity',
  `action` varchar(64) NOT NULL COMMENT 'Action performed: CREATE, UPDATE, DELETE, DEACTIVATE, REACTIVATE, etc.',
  `result` varchar(16) NOT NULL,
  `success` tinyint(1) NOT NULL DEFAULT 1,
  `status` tinyint(4) NOT NULL DEFAULT 1,
  `ip_address` varchar(45) DEFAULT NULL,
  `payload_json` longtext NOT NULL COMMENT 'Original payload or context data',
  `changes_json` longtext DEFAULT NULL COMMENT 'Before/after changes for updates (JSON format)',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_company_created_at` (`company_id`,`created_at`),
  KEY `idx_audit_logs_user_created_at` (`user_id`,`created_at`),
  KEY `idx_audit_logs_action_created_at` (`action`,`created_at`),
  KEY `fk_audit_logs_outlet` (`outlet_id`),
  KEY `idx_audit_logs_entity` (`entity_type`,`entity_id`,`created_at`),
  KEY `idx_audit_logs_action_result_created` (`action`,`result`,`created_at`),
  KEY `idx_audit_logs_company_entity_type_created` (`company_id`,`entity_type`,`entity_id`,`created_at`),
  CONSTRAINT `fk_audit_logs_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_audit_logs_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_audit_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_audit_logs_payload_json` CHECK (json_valid(`payload_json`)),
  CONSTRAINT `chk_audit_logs_changes_json` CHECK (`changes_json` is null or json_valid(`changes_json`)),
  CONSTRAINT `chk_audit_logs_success` CHECK (`success` in (0,1)),
  CONSTRAINT `chk_audit_logs_status` CHECK (`status` between 0 and 7)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
