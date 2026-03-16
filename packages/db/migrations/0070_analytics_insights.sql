-- Migration: 0070_analytics_insights.sql
-- Generated from: 0000_version_1.sql
-- Table: analytics_insights
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `analytics_insights` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `insight_type` enum('TREND','ANOMALY','SEASONALITY','PEAK_HOURS','TOP_PRODUCTS','UNDERPERFORMING') NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `metric_name` varchar(100) NOT NULL,
  `metric_value` decimal(18,4) NOT NULL,
  `reference_period` varchar(50) NOT NULL COMMENT 'e.g., 2024-Q1, last-30-days',
  `severity` enum('INFO','WARNING','CRITICAL') NOT NULL DEFAULT 'INFO',
  `description` text NOT NULL,
  `recommendation` text DEFAULT NULL,
  `calculated_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_analytics_insights_company` (`company_id`),
  KEY `idx_analytics_insights_type` (`insight_type`),
  KEY `idx_analytics_insights_expires` (`expires_at`),
  KEY `outlet_id` (`outlet_id`),
  CONSTRAINT `analytics_insights_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `analytics_insights_ibfk_2` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
