-- Migration: 0061_reservations.sql
-- Generated from: 0000_version_1.sql
-- Table: reservations
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `reservations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `table_id` bigint(20) unsigned DEFAULT NULL,
  `customer_name` varchar(191) NOT NULL,
  `customer_phone` varchar(64) DEFAULT NULL,
  `guest_count` int(10) unsigned NOT NULL,
  `reservation_at` datetime NOT NULL,
  `duration_minutes` int(10) unsigned DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'BOOKED',
  `notes` varchar(500) DEFAULT NULL,
  `linked_order_id` char(36) DEFAULT NULL,
  `arrived_at` datetime DEFAULT NULL,
  `seated_at` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_reservations_company_outlet_id` (`company_id`,`outlet_id`,`id`),
  KEY `idx_reservations_company_outlet_time` (`company_id`,`outlet_id`,`reservation_at`),
  KEY `idx_reservations_company_outlet_status` (`company_id`,`outlet_id`,`status`),
  KEY `idx_reservations_company_outlet_table` (`company_id`,`outlet_id`,`table_id`),
  KEY `idx_reservations_scope_table_status` (`company_id`,`outlet_id`,`table_id`,`status`),
  CONSTRAINT `fk_reservations_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_reservations_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `fk_reservations_table_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `table_id`) REFERENCES `outlet_tables` (`company_id`, `outlet_id`, `id`),
  CONSTRAINT `chk_reservations_status` CHECK (`status` in ('BOOKED','CONFIRMED','ARRIVED','SEATED','COMPLETED','CANCELLED','NO_SHOW')),
  CONSTRAINT `chk_reservations_guest_count` CHECK (`guest_count` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
