-- Migration: 0040_journal_batches.sql
-- Generated from: 0000_version_1.sql
-- Table: journal_batches
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `journal_batches` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `doc_type` varchar(64) NOT NULL,
  `doc_id` bigint(20) unsigned NOT NULL,
  `client_ref` char(36) DEFAULT NULL,
  `posted_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_journal_batches_company_doc` (`company_id`,`doc_type`,`doc_id`),
  UNIQUE KEY `uq_journal_batches_company_doc_client_ref` (`company_id`,`doc_type`,`client_ref`),
  KEY `idx_journal_batches_company_posted_at` (`company_id`,`posted_at`),
  KEY `idx_journal_batches_outlet_posted_at` (`outlet_id`,`posted_at`),
  KEY `idx_journal_batches_doc_type_doc_id` (`doc_type`,`doc_id`),
  KEY `idx_journal_batches_company_posted_outlet` (`company_id`,`posted_at`,`outlet_id`,`id`),
  KEY `idx_journal_batches_doctype_docid` (`doc_type`,`doc_id`),
  CONSTRAINT `fk_journal_batches_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_journal_batches_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
