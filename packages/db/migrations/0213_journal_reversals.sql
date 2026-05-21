-- Migration: 0213_journal_reversals.sql
-- Description: Add immutable journal void/reversal cross-link persistence.
-- Compatible with: MySQL 8.0+, MariaDB

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE IF NOT EXISTS `journal_reversals` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `original_journal_batch_id` bigint(20) unsigned NOT NULL,
  `reversal_journal_batch_id` bigint(20) unsigned NOT NULL,
  `void_reason` varchar(500) NOT NULL,
  `voided_at` datetime NOT NULL DEFAULT current_timestamp(),
  `voided_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_journal_reversals_original` (`company_id`,`original_journal_batch_id`),
  UNIQUE KEY `uq_journal_reversals_reversal` (`company_id`,`reversal_journal_batch_id`),
  KEY `idx_journal_reversals_company_voided_at` (`company_id`,`voided_at`,`id`),
  KEY `idx_journal_reversals_voided_by` (`voided_by_user_id`),
  CONSTRAINT `fk_journal_reversals_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_journal_reversals_original_batch` FOREIGN KEY (`original_journal_batch_id`) REFERENCES `journal_batches` (`id`),
  CONSTRAINT `fk_journal_reversals_reversal_batch` FOREIGN KEY (`reversal_journal_batch_id`) REFERENCES `journal_batches` (`id`),
  CONSTRAINT `fk_journal_reversals_voided_by` FOREIGN KEY (`voided_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
