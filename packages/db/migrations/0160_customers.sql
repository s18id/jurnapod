-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0160_customers
-- Story: Epic 44.1 - Customer Master CRUD
-- Description: Create customers table for AR customer management.
--             Customer codes are unique per company and never reused after soft delete.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: yes

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

-- ==============================================================================
-- STEP 1: Create customers table
-- ==============================================================================

CREATE TABLE IF NOT EXISTS `customers` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `code` varchar(32) NOT NULL,
  `type` enum('PERSON','BUSINESS') NOT NULL DEFAULT 'PERSON',
  `display_name` varchar(191) NOT NULL,
  `company_name` varchar(191) DEFAULT NULL COMMENT 'Required when type=BUSINESS',
  `tax_id` varchar(64) DEFAULT NULL,
  `email` varchar(191) DEFAULT NULL,
  `phone` varchar(32) DEFAULT NULL,
  `address_line1` varchar(191) DEFAULT NULL,
  `address_line2` varchar(191) DEFAULT NULL,
  `city` varchar(96) DEFAULT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  -- Permanent unique code per company (never reused after soft delete)
  UNIQUE KEY `uq_customers_company_code` (`company_id`,`code`),
  KEY `idx_customers_company_id` (`company_id`),
  KEY `idx_customers_deleted_at` (`deleted_at`),
  KEY `idx_customers_email` (`email`),
  KEY `idx_customers_is_active` (`is_active`),
  CONSTRAINT `fk_customers_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_customers_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_customers_updated_by` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
