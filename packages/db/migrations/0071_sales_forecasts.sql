-- Migration: 0071_sales_forecasts.sql
-- Generated from: 0000_version_1.sql
-- Table: sales_forecasts
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Collation: utf8mb4_unicode_ci

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE `sales_forecasts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `forecast_type` enum('DAILY','WEEKLY','MONTHLY') NOT NULL,
  `forecast_date` date NOT NULL,
  `predicted_amount` decimal(18,2) NOT NULL,
  `confidence_lower` decimal(18,2) DEFAULT NULL,
  `confidence_upper` decimal(18,2) DEFAULT NULL,
  `model_version` varchar(50) NOT NULL DEFAULT 'v1.0',
  `generated_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_forecast` (`company_id`,`outlet_id`,`forecast_type`,`forecast_date`),
  KEY `idx_sales_forecasts_company` (`company_id`),
  KEY `idx_sales_forecasts_date` (`forecast_date`),
  KEY `idx_sales_forecasts_outlet` (`outlet_id`),
  CONSTRAINT `sales_forecasts_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sales_forecasts_ibfk_2` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
