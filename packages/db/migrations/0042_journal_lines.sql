-- Migration: 0042_journal_lines.sql
-- Generated from: 0000_version_1.sql
-- Table: journal_lines
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `journal_lines` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `journal_batch_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `account_id` bigint(20) unsigned NOT NULL,
  `line_date` date NOT NULL,
  `debit` decimal(18,2) NOT NULL DEFAULT 0.00,
  `credit` decimal(18,2) NOT NULL DEFAULT 0.00,
  `description` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_journal_lines_account_date` (`account_id`,`line_date`),
  KEY `idx_journal_lines_outlet_date` (`outlet_id`,`line_date`),
  KEY `fk_journal_lines_batch` (`journal_batch_id`),
  KEY `idx_journal_lines_company_date_account` (`company_id`,`line_date`,`account_id`,`outlet_id`),
  KEY `idx_journal_lines_company_date_outlet` (`company_id`,`line_date`,`outlet_id`,`account_id`),
  CONSTRAINT `fk_journal_lines_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_journal_lines_batch` FOREIGN KEY (`journal_batch_id`) REFERENCES `journal_batches` (`id`),
  CONSTRAINT `fk_journal_lines_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_journal_lines_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `chk_journal_lines_debit_non_negative` CHECK (`debit` >= 0),
  CONSTRAINT `chk_journal_lines_credit_non_negative` CHECK (`credit` >= 0),
  CONSTRAINT `chk_journal_lines_one_sided_positive` CHECK (`debit` > 0 and `credit` = 0 or `credit` > 0 and `debit` = 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
