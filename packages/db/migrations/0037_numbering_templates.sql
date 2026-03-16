-- Migration: 0037_numbering_templates.sql
-- Generated from: 0000_version_1.sql
-- Table: numbering_templates
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `numbering_templates` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `scope_key` bigint(20) unsigned NOT NULL DEFAULT 0,
  `doc_type` varchar(32) NOT NULL,
  `pattern` varchar(128) NOT NULL,
  `reset_period` varchar(16) NOT NULL DEFAULT 'NEVER',
  `current_value` int(10) unsigned NOT NULL DEFAULT 0,
  `last_reset` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_numbering_templates_company_scope_doc` (`company_id`,`doc_type`,`scope_key`),
  UNIQUE KEY `uq_numbering_templates_company_outlet_doc` (`company_id`,`outlet_id`,`doc_type`),
  KEY `idx_numbering_templates_company_active` (`company_id`,`is_active`),
  KEY `idx_numbering_templates_outlet_active` (`outlet_id`,`is_active`),
  KEY `idx_numbering_templates_lookup` (`company_id`,`doc_type`,`is_active`,`outlet_id`),
  CONSTRAINT `fk_numbering_templates_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_numbering_templates_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`) ON DELETE CASCADE,
  CONSTRAINT `chk_numbering_templates_reset_period` CHECK (`reset_period` in ('NEVER','YEARLY','MONTHLY')),
  CONSTRAINT `chk_numbering_templates_current_value` CHECK (`current_value` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
