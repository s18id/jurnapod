-- Migration: 0066_pos_order_snapshots.sql
-- Generated from: 0000_version_1.sql
-- Table: pos_order_snapshots
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `pos_order_snapshots` (
  `order_id` char(36) NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `service_type` varchar(16) NOT NULL,
  `source_flow` varchar(16) DEFAULT NULL,
  `settlement_flow` varchar(16) DEFAULT NULL,
  `table_id` bigint(20) unsigned DEFAULT NULL,
  `reservation_id` bigint(20) unsigned DEFAULT NULL,
  `guest_count` int(10) unsigned DEFAULT NULL,
  `is_finalized` tinyint(1) NOT NULL DEFAULT 0,
  `order_status` varchar(16) NOT NULL,
  `order_state` varchar(16) NOT NULL,
  `paid_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `opened_at` datetime NOT NULL,
  `closed_at` datetime DEFAULT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `updated_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`order_id`),
  KEY `idx_pos_order_snapshots_scope_state_updated` (`company_id`,`outlet_id`,`order_state`,`updated_at`),
  KEY `fk_pos_order_snapshots_outlet` (`outlet_id`),
  KEY `idx_pos_order_snapshots_scope_table_service_state` (`company_id`,`outlet_id`,`table_id`,`service_type`,`order_state`),
  CONSTRAINT `fk_pos_order_snapshots_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_pos_order_snapshots_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `chk_pos_order_snapshots_service_type` CHECK (`service_type` in ('TAKEAWAY','DINE_IN')),
  CONSTRAINT `chk_pos_order_snapshots_order_status` CHECK (`order_status` in ('OPEN','READY_TO_PAY','COMPLETED','CANCELLED')),
  CONSTRAINT `chk_pos_order_snapshots_order_state` CHECK (`order_state` in ('OPEN','CLOSED')),
  CONSTRAINT `chk_pos_order_snapshots_source_flow` CHECK (`source_flow` is null or `source_flow` in ('WALK_IN','RESERVATION','PHONE','ONLINE','MANUAL')),
  CONSTRAINT `chk_pos_order_snapshots_settlement_flow` CHECK (`settlement_flow` is null or `settlement_flow` in ('IMMEDIATE','DEFERRED','SPLIT'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
