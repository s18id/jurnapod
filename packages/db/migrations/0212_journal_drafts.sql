-- Migration: 0212_journal_drafts.sql
-- Description: Add mutable journal draft tables for create/edit/post lifecycle.
-- Compatible with: MySQL 8.0+, MariaDB

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE IF NOT EXISTS `journal_drafts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `entry_date` date NOT NULL,
  `reference` varchar(100) DEFAULT NULL,
  `description` varchar(500) NOT NULL,
  `client_ref` char(36) DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'DRAFT',
  `posted_batch_id` bigint(20) unsigned DEFAULT NULL,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `posted_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `posted_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_journal_drafts_company_client_ref` (`company_id`,`client_ref`),
  KEY `idx_journal_drafts_company_status_date` (`company_id`,`status`,`entry_date`,`id`),
  KEY `idx_journal_drafts_outlet_date` (`outlet_id`,`entry_date`),
  KEY `idx_journal_drafts_posted_batch` (`posted_batch_id`),
  CONSTRAINT `fk_journal_drafts_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_journal_drafts_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_journal_drafts_posted_batch` FOREIGN KEY (`posted_batch_id`) REFERENCES `journal_batches` (`id`),
  CONSTRAINT `chk_journal_drafts_status` CHECK (`status` IN ('DRAFT','POSTED'))
) ENGINE=InnoDB AUTO_INCREMENT=900000000000 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `journal_draft_lines` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `journal_draft_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `account_id` bigint(20) unsigned NOT NULL,
  `line_date` date NOT NULL,
  `debit` decimal(19,4) NOT NULL DEFAULT 0.0000,
  `credit` decimal(19,4) NOT NULL DEFAULT 0.0000,
  `description` varchar(255) NOT NULL,
  `line_no` int unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_journal_draft_lines_draft` (`journal_draft_id`,`line_no`),
  KEY `idx_journal_draft_lines_account_date` (`account_id`,`line_date`),
  KEY `idx_journal_draft_lines_company_date_account` (`company_id`,`line_date`,`account_id`,`outlet_id`),
  CONSTRAINT `fk_journal_draft_lines_draft` FOREIGN KEY (`journal_draft_id`) REFERENCES `journal_drafts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_journal_draft_lines_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_journal_draft_lines_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_journal_draft_lines_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `chk_journal_draft_lines_debit_non_negative` CHECK (`debit` >= 0),
  CONSTRAINT `chk_journal_draft_lines_credit_non_negative` CHECK (`credit` >= 0),
  CONSTRAINT `chk_journal_draft_lines_one_sided_positive` CHECK ((`debit` > 0 AND `credit` = 0) OR (`credit` > 0 AND `debit` = 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
