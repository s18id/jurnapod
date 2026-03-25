/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-11.5.2-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: 172.18.0.2    Database: jurnapod
-- ------------------------------------------------------
-- Server version	11.8.5-MariaDB-ubu2404-log

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Table structure for table `account_balances_current`
--

DROP TABLE IF EXISTS `account_balances_current`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `account_balances_current` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `account_id` bigint(20) unsigned NOT NULL,
  `as_of_date` date NOT NULL,
  `debit_total` decimal(18,2) NOT NULL DEFAULT 0.00,
  `credit_total` decimal(18,2) NOT NULL DEFAULT 0.00,
  `balance` decimal(18,2) NOT NULL DEFAULT 0.00,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_account_balances_current_company_account` (`company_id`,`account_id`),
  KEY `idx_account_balances_current_company_as_of` (`company_id`,`as_of_date`),
  KEY `fk_account_balances_current_account` (`account_id`),
  CONSTRAINT `fk_account_balances_current_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_account_balances_current_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `account_balances_current`
--

LOCK TABLES `account_balances_current` WRITE;
/*!40000 ALTER TABLE `account_balances_current` DISABLE KEYS */;
/*!40000 ALTER TABLE `account_balances_current` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `account_types`
--

DROP TABLE IF EXISTS `account_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `account_types` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `name` varchar(191) NOT NULL COMMENT 'Account type name (e.g., Kas, Bank, Pendapatan)',
  `category` varchar(20) DEFAULT NULL COMMENT 'Standard account category: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE',
  `normal_balance` char(1) DEFAULT NULL COMMENT 'D=Debit, K=Kredit',
  `report_group` varchar(8) DEFAULT NULL COMMENT 'NRC=Neraca, PL=Laba Rugi',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_account_types_company_name` (`company_id`,`name`),
  KEY `idx_account_types_category` (`company_id`,`category`,`is_active`),
  CONSTRAINT `fk_account_types_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='Account type definitions with normal balance and report group';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `account_types`
--

LOCK TABLES `account_types` WRITE;
/*!40000 ALTER TABLE `account_types` DISABLE KEYS */;
/*!40000 ALTER TABLE `account_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `accounts`
--

DROP TABLE IF EXISTS `accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `accounts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `code` varchar(32) NOT NULL,
  `name` varchar(191) NOT NULL,
  `account_type_id` bigint(20) unsigned DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_payable` tinyint(1) NOT NULL DEFAULT 0,
  `type_name` varchar(191) DEFAULT NULL,
  `normal_balance` char(1) DEFAULT NULL,
  `report_group` varchar(8) DEFAULT NULL,
  `parent_account_id` bigint(20) unsigned DEFAULT NULL,
  `is_group` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_accounts_company_code` (`company_id`,`code`),
  KEY `idx_accounts_company_id_id` (`company_id`,`id`),
  KEY `idx_accounts_parent_account_id` (`parent_account_id`),
  KEY `idx_accounts_type` (`account_type_id`),
  KEY `idx_accounts_company_payable_active` (`company_id`,`is_payable`,`is_active`,`id`),
  CONSTRAINT `fk_accounts_account_type` FOREIGN KEY (`account_type_id`) REFERENCES `account_types` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_accounts_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_accounts_parent` FOREIGN KEY (`parent_account_id`) REFERENCES `accounts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounts`
--

LOCK TABLES `accounts` WRITE;
/*!40000 ALTER TABLE `accounts` DISABLE KEYS */;
/*!40000 ALTER TABLE `accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `analytics_insights`
--

DROP TABLE IF EXISTS `analytics_insights`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `analytics_insights`
--

LOCK TABLES `analytics_insights` WRITE;
/*!40000 ALTER TABLE `analytics_insights` DISABLE KEYS */;
/*!40000 ALTER TABLE `analytics_insights` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `asset_depreciation_plans`
--

DROP TABLE IF EXISTS `asset_depreciation_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `asset_depreciation_plans` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `asset_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `method` varchar(32) NOT NULL DEFAULT 'STRAIGHT_LINE',
  `start_date` date NOT NULL,
  `useful_life_months` int(10) unsigned NOT NULL,
  `salvage_value` decimal(18,2) NOT NULL DEFAULT 0.00,
  `purchase_cost_snapshot` decimal(18,2) NOT NULL,
  `expense_account_id` bigint(20) unsigned NOT NULL,
  `accum_depr_account_id` bigint(20) unsigned NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'DRAFT',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_depr_plans_company_asset` (`company_id`,`asset_id`),
  KEY `fk_depr_plans_asset` (`asset_id`),
  KEY `fk_depr_plans_outlet` (`outlet_id`),
  KEY `fk_depr_plans_expense_account` (`expense_account_id`),
  KEY `fk_depr_plans_accum_account` (`accum_depr_account_id`),
  KEY `idx_depr_plans_company_asset_status` (`company_id`,`asset_id`,`status`,`id`),
  CONSTRAINT `fk_depr_plans_accum_account` FOREIGN KEY (`accum_depr_account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_depr_plans_asset` FOREIGN KEY (`asset_id`) REFERENCES `fixed_assets` (`id`),
  CONSTRAINT `fk_depr_plans_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_depr_plans_expense_account` FOREIGN KEY (`expense_account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_depr_plans_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `chk_depr_plans_status` CHECK (`status` in ('DRAFT','ACTIVE','VOID')),
  CONSTRAINT `chk_depr_plans_useful_life_positive` CHECK (`useful_life_months` > 0),
  CONSTRAINT `chk_depr_plans_salvage_non_negative` CHECK (`salvage_value` >= 0),
  CONSTRAINT `chk_depr_plans_purchase_cost_non_negative` CHECK (`purchase_cost_snapshot` >= 0),
  CONSTRAINT `chk_depr_plans_method` CHECK (`method` in ('STRAIGHT_LINE','DECLINING_BALANCE','SUM_OF_YEARS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `asset_depreciation_plans`
--

LOCK TABLES `asset_depreciation_plans` WRITE;
/*!40000 ALTER TABLE `asset_depreciation_plans` DISABLE KEYS */;
/*!40000 ALTER TABLE `asset_depreciation_plans` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `asset_depreciation_runs`
--

DROP TABLE IF EXISTS `asset_depreciation_runs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `asset_depreciation_runs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `plan_id` bigint(20) unsigned NOT NULL,
  `period_year` int(10) unsigned NOT NULL,
  `period_month` tinyint(3) unsigned NOT NULL,
  `run_date` date NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `journal_batch_id` bigint(20) unsigned DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'POSTED',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_depr_runs_plan_period` (`plan_id`,`period_year`,`period_month`),
  KEY `idx_depr_runs_company_period` (`company_id`,`period_year`,`period_month`),
  KEY `idx_depr_runs_company_status` (`company_id`,`status`),
  KEY `fk_depr_runs_journal_batch` (`journal_batch_id`),
  KEY `idx_depr_runs_plan_status` (`plan_id`,`status`,`period_year`,`period_month`),
  CONSTRAINT `fk_depr_runs_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_depr_runs_journal_batch` FOREIGN KEY (`journal_batch_id`) REFERENCES `journal_batches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_depr_runs_plan` FOREIGN KEY (`plan_id`) REFERENCES `asset_depreciation_plans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_depr_runs_period_month` CHECK (`period_month` between 1 and 12),
  CONSTRAINT `chk_depr_runs_amount_non_negative` CHECK (`amount` >= 0),
  CONSTRAINT `chk_depr_runs_status` CHECK (`status` in ('POSTED','VOID'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `asset_depreciation_runs`
--

LOCK TABLES `asset_depreciation_runs` WRITE;
/*!40000 ALTER TABLE `asset_depreciation_runs` DISABLE KEYS */;
/*!40000 ALTER TABLE `asset_depreciation_runs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `audit_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned DEFAULT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `entity_type` varchar(64) DEFAULT NULL COMMENT 'Entity type: account, account_type, item, invoice, etc.',
  `entity_id` varchar(128) DEFAULT NULL COMMENT 'ID of the affected entity',
  `action` varchar(64) NOT NULL COMMENT 'Action performed: CREATE, UPDATE, DELETE, DEACTIVATE, REACTIVATE, etc.',
  `result` varchar(16) NOT NULL,
  `success` tinyint(1) NOT NULL DEFAULT 1,
  `status` tinyint(4) NOT NULL DEFAULT 1,
  `ip_address` varchar(45) DEFAULT NULL,
  `payload_json` longtext NOT NULL COMMENT 'Original payload or context data',
  `changes_json` longtext DEFAULT NULL COMMENT 'Before/after changes for updates (JSON format)',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_company_created_at` (`company_id`,`created_at`),
  KEY `idx_audit_logs_user_created_at` (`user_id`,`created_at`),
  KEY `idx_audit_logs_action_created_at` (`action`,`created_at`),
  KEY `fk_audit_logs_outlet` (`outlet_id`),
  KEY `idx_audit_logs_entity` (`entity_type`,`entity_id`,`created_at`),
  KEY `idx_audit_logs_action_result_created` (`action`,`result`,`created_at`),
  KEY `idx_audit_logs_company_entity_type_created` (`company_id`,`entity_type`,`entity_id`,`created_at`),
  CONSTRAINT `fk_audit_logs_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_audit_logs_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_audit_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_audit_logs_payload_json` CHECK (json_valid(`payload_json`)),
  CONSTRAINT `chk_audit_logs_changes_json` CHECK (`changes_json` is null or json_valid(`changes_json`)),
  CONSTRAINT `chk_audit_logs_success` CHECK (`success` in (0,1)),
  CONSTRAINT `chk_audit_logs_status` CHECK (`status` between 0 and 7)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_logs`
--

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_login_throttles`
--

DROP TABLE IF EXISTS `auth_login_throttles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `auth_login_throttles` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `key_hash` char(64) NOT NULL,
  `failure_count` int(10) unsigned NOT NULL DEFAULT 0,
  `last_failed_at` datetime DEFAULT NULL,
  `last_ip` varchar(45) DEFAULT NULL,
  `last_user_agent` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_login_throttles_key` (`key_hash`),
  KEY `idx_auth_login_throttles_last_failed` (`last_failed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_login_throttles`
--

LOCK TABLES `auth_login_throttles` WRITE;
/*!40000 ALTER TABLE `auth_login_throttles` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_login_throttles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_oauth_accounts`
--

DROP TABLE IF EXISTS `auth_oauth_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `auth_oauth_accounts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `provider` varchar(32) NOT NULL,
  `provider_user_id` varchar(191) NOT NULL,
  `email_snapshot` varchar(191) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_oauth_accounts_provider_user` (`provider`,`provider_user_id`,`company_id`),
  KEY `idx_auth_oauth_accounts_user` (`user_id`),
  KEY `idx_auth_oauth_accounts_company` (`company_id`),
  CONSTRAINT `fk_auth_oauth_accounts_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_auth_oauth_accounts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_oauth_accounts`
--

LOCK TABLES `auth_oauth_accounts` WRITE;
/*!40000 ALTER TABLE `auth_oauth_accounts` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_oauth_accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_password_reset_throttles`
--

DROP TABLE IF EXISTS `auth_password_reset_throttles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `auth_password_reset_throttles` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `key_hash` char(64) NOT NULL,
  `request_count` int(10) unsigned NOT NULL DEFAULT 0,
  `window_started_at` datetime NOT NULL,
  `last_ip` varchar(45) DEFAULT NULL,
  `last_user_agent` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_password_reset_throttles_key` (`key_hash`),
  KEY `idx_auth_password_reset_throttles_window` (`window_started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_password_reset_throttles`
--

LOCK TABLES `auth_password_reset_throttles` WRITE;
/*!40000 ALTER TABLE `auth_password_reset_throttles` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_password_reset_throttles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_refresh_tokens`
--

DROP TABLE IF EXISTS `auth_refresh_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `auth_refresh_tokens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `rotated_from_id` bigint(20) unsigned DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_refresh_tokens_hash` (`token_hash`),
  KEY `idx_auth_refresh_tokens_user_expires` (`user_id`,`expires_at`),
  KEY `idx_auth_refresh_tokens_company_expires` (`company_id`,`expires_at`),
  KEY `idx_auth_refresh_tokens_rotated_from` (`rotated_from_id`),
  CONSTRAINT `fk_auth_refresh_tokens_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_auth_refresh_tokens_rotated_from` FOREIGN KEY (`rotated_from_id`) REFERENCES `auth_refresh_tokens` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_auth_refresh_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_refresh_tokens`
--

LOCK TABLES `auth_refresh_tokens` WRITE;
/*!40000 ALTER TABLE `auth_refresh_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_refresh_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `backoffice_sync_queue`
--

DROP TABLE IF EXISTS `backoffice_sync_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `backoffice_sync_queue` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `document_type` enum('INVOICE','PAYMENT','JOURNAL','REPORT','RECONCILIATION','SCHEDULED_EXPORT','FORECAST_GENERATION','INSIGHTS_CALCULATION') NOT NULL,
  `document_id` bigint(20) unsigned NOT NULL,
  `tier` enum('OPERATIONAL','MASTER','ADMIN','ANALYTICS') NOT NULL,
  `sync_status` enum('PENDING','PROCESSING','SUCCESS','FAILED') NOT NULL DEFAULT 'PENDING',
  `scheduled_at` datetime NOT NULL DEFAULT current_timestamp(),
  `processing_started_at` datetime DEFAULT NULL,
  `processed_at` datetime DEFAULT NULL,
  `retry_count` int(10) unsigned NOT NULL DEFAULT 0,
  `max_retries` int(10) unsigned NOT NULL DEFAULT 3,
  `error_message` text DEFAULT NULL,
  `payload_hash` varchar(64) DEFAULT NULL COMMENT 'SHA-256 hash for duplicate detection',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_backoffice_sync_document` (`company_id`,`document_type`,`document_id`,`payload_hash`),
  KEY `idx_backoffice_sync_queue_scheduled` (`scheduled_at`),
  KEY `idx_backoffice_sync_queue_retry` (`retry_count`,`max_retries`),
  KEY `idx_backoffice_sync_queue_document` (`document_type`,`document_id`),
  KEY `idx_backoffice_sync_queue_company_status` (`company_id`,`sync_status`),
  KEY `idx_backoffice_sync_queue_tier_status` (`tier`,`sync_status`),
  CONSTRAINT `backoffice_sync_queue_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `backoffice_sync_queue`
--

LOCK TABLES `backoffice_sync_queue` WRITE;
/*!40000 ALTER TABLE `backoffice_sync_queue` DISABLE KEYS */;
/*!40000 ALTER TABLE `backoffice_sync_queue` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `cash_bank_transactions`
--

DROP TABLE IF EXISTS `cash_bank_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cash_bank_transactions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `transaction_type` enum('MUTATION','TOP_UP','WITHDRAWAL','FOREX') NOT NULL,
  `transaction_date` date NOT NULL,
  `reference` varchar(100) DEFAULT NULL,
  `description` varchar(500) NOT NULL,
  `source_account_id` bigint(20) unsigned NOT NULL,
  `destination_account_id` bigint(20) unsigned NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `currency_code` varchar(3) NOT NULL DEFAULT 'IDR',
  `exchange_rate` decimal(18,8) DEFAULT NULL,
  `base_amount` decimal(18,2) DEFAULT NULL,
  `fx_gain_loss` decimal(18,2) DEFAULT 0.00,
  `fx_account_id` bigint(20) unsigned DEFAULT NULL,
  `status` enum('DRAFT','POSTED','VOID') NOT NULL DEFAULT 'DRAFT',
  `posted_at` datetime DEFAULT NULL,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cash_bank_tx_company_reference` (`company_id`,`reference`),
  KEY `idx_cash_bank_tx_company_date` (`company_id`,`transaction_date`),
  KEY `idx_cash_bank_tx_company_type` (`company_id`,`transaction_type`),
  KEY `idx_cash_bank_tx_company_status` (`company_id`,`status`),
  KEY `idx_cash_bank_tx_company_outlet_date` (`company_id`,`outlet_id`,`transaction_date`),
  KEY `idx_cash_bank_tx_company_source` (`company_id`,`source_account_id`),
  KEY `idx_cash_bank_tx_company_dest` (`company_id`,`destination_account_id`),
  KEY `idx_cash_bank_tx_company_fx` (`company_id`,`fx_account_id`),
  CONSTRAINT `fk_cash_bank_tx_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_cash_bank_tx_dest_account` FOREIGN KEY (`company_id`, `destination_account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `fk_cash_bank_tx_fx_account` FOREIGN KEY (`company_id`, `fx_account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `fk_cash_bank_tx_outlet` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `fk_cash_bank_tx_source_account` FOREIGN KEY (`company_id`, `source_account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `chk_cash_bank_tx_amount_positive` CHECK (`amount` > 0),
  CONSTRAINT `chk_cash_bank_tx_source_dest_diff` CHECK (`source_account_id` <> `destination_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cash_bank_transactions`
--

LOCK TABLES `cash_bank_transactions` WRITE;
/*!40000 ALTER TABLE `cash_bank_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `cash_bank_transactions` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_cash_bank_transactions_ai_bump_sync_version
AFTER INSERT ON cash_bank_transactions
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_cash_bank_transactions_au_bump_sync_version
AFTER UPDATE ON cash_bank_transactions
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_cash_bank_transactions_ad_bump_sync_version
AFTER DELETE ON cash_bank_transactions
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (OLD.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `companies`
--

DROP TABLE IF EXISTS `companies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `companies` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `name` varchar(191) NOT NULL,
  `legal_name` varchar(191) DEFAULT NULL,
  `tax_id` varchar(64) DEFAULT NULL,
  `email` varchar(191) DEFAULT NULL,
  `timezone` varchar(50) DEFAULT 'UTC',
  `currency_code` varchar(3) DEFAULT 'IDR',
  `phone` varchar(32) DEFAULT NULL,
  `address_line1` varchar(191) DEFAULT NULL,
  `address_line2` varchar(191) DEFAULT NULL,
  `city` varchar(96) DEFAULT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_companies_code` (`code`),
  KEY `idx_companies_deleted_at` (`deleted_at`),
  KEY `idx_companies_city` (`city`),
  KEY `idx_companies_timezone` (`timezone`),
  KEY `idx_companies_currency_code` (`currency_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `companies`
--

LOCK TABLES `companies` WRITE;
/*!40000 ALTER TABLE `companies` DISABLE KEYS */;
/*!40000 ALTER TABLE `companies` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `company_account_mappings`
--

DROP TABLE IF EXISTS `company_account_mappings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `company_account_mappings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `mapping_key` varchar(64) NOT NULL,
  `account_id` bigint(20) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_company_account_mappings_key` (`company_id`,`mapping_key`),
  KEY `idx_company_account_mappings_account` (`company_id`,`account_id`),
  CONSTRAINT `fk_company_account_mappings_account` FOREIGN KEY (`company_id`, `account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `fk_company_account_mappings_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `chk_company_account_mappings_key` CHECK (`mapping_key` in ('AR','SALES_REVENUE','SALES_RETURNS','INVOICE_PAYMENT_BANK','PAYMENT_VARIANCE_GAIN','PAYMENT_VARIANCE_LOSS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company_account_mappings`
--

LOCK TABLES `company_account_mappings` WRITE;
/*!40000 ALTER TABLE `company_account_mappings` DISABLE KEYS */;
/*!40000 ALTER TABLE `company_account_mappings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `company_modules`
--

DROP TABLE IF EXISTS `company_modules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `company_modules` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `module_id` bigint(20) unsigned NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 0,
  `config_json` longtext NOT NULL,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_company_modules_company_module` (`company_id`,`module_id`),
  KEY `idx_company_modules_company` (`company_id`),
  KEY `idx_company_modules_module` (`module_id`),
  KEY `fk_company_modules_created_by_user` (`created_by_user_id`),
  KEY `fk_company_modules_updated_by_user` (`updated_by_user_id`),
  CONSTRAINT `fk_company_modules_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_company_modules_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_company_modules_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`),
  CONSTRAINT `fk_company_modules_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_company_modules_config_json` CHECK (json_valid(`config_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company_modules`
--

LOCK TABLES `company_modules` WRITE;
/*!40000 ALTER TABLE `company_modules` DISABLE KEYS */;
/*!40000 ALTER TABLE `company_modules` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_company_modules_ai_bump_sync_version
AFTER INSERT ON company_modules
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_company_modules_au_bump_sync_version
AFTER UPDATE ON company_modules
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_company_modules_ad_bump_sync_version
AFTER DELETE ON company_modules
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (OLD.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `company_payment_method_mappings`
--

DROP TABLE IF EXISTS `company_payment_method_mappings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `company_payment_method_mappings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `method_code` varchar(64) NOT NULL,
  `account_id` bigint(20) unsigned NOT NULL,
  `label` varchar(191) DEFAULT NULL,
  `is_invoice_default` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_company_payment_method_code` (`company_id`,`method_code`),
  KEY `idx_company_payment_method_account` (`company_id`,`account_id`),
  KEY `idx_company_payment_method_invoice_default` (`company_id`,`is_invoice_default`),
  CONSTRAINT `fk_company_payment_method_account` FOREIGN KEY (`company_id`, `account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `fk_company_payment_method_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company_payment_method_mappings`
--

LOCK TABLES `company_payment_method_mappings` WRITE;
/*!40000 ALTER TABLE `company_payment_method_mappings` DISABLE KEYS */;
/*!40000 ALTER TABLE `company_payment_method_mappings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `company_settings`
--

DROP TABLE IF EXISTS `company_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `company_settings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `key` varchar(64) NOT NULL,
  `value_type` varchar(16) NOT NULL,
  `value_json` longtext NOT NULL,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_company_settings_company_key` (`company_id`,`outlet_id`,`key`),
  KEY `idx_company_settings_scope` (`company_id`,`outlet_id`),
  KEY `fk_company_settings_created_by_user` (`created_by_user_id`),
  KEY `fk_company_settings_updated_by_user` (`updated_by_user_id`),
  CONSTRAINT `fk_company_settings_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_company_settings_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_company_settings_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `fk_company_settings_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_company_settings_value_json` CHECK (json_valid(`value_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company_settings`
--

LOCK TABLES `company_settings` WRITE;
/*!40000 ALTER TABLE `company_settings` DISABLE KEYS */;
/*!40000 ALTER TABLE `company_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `company_tax_defaults`
--

DROP TABLE IF EXISTS `company_tax_defaults`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `company_tax_defaults` (
  `company_id` bigint(20) unsigned NOT NULL,
  `tax_rate_id` bigint(20) unsigned NOT NULL,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`company_id`,`tax_rate_id`),
  KEY `idx_company_tax_defaults_tax_rate` (`tax_rate_id`),
  KEY `fk_company_tax_defaults_created_by_user` (`created_by_user_id`),
  KEY `fk_company_tax_defaults_updated_by_user` (`updated_by_user_id`),
  CONSTRAINT `fk_company_tax_defaults_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_company_tax_defaults_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_company_tax_defaults_tax_rate` FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_company_tax_defaults_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `company_tax_defaults`
--

LOCK TABLES `company_tax_defaults` WRITE;
/*!40000 ALTER TABLE `company_tax_defaults` DISABLE KEYS */;
/*!40000 ALTER TABLE `company_tax_defaults` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_company_tax_defaults_ai_bump_sync_version
AFTER INSERT ON company_tax_defaults
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_company_tax_defaults_au_bump_sync_version
AFTER UPDATE ON company_tax_defaults
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_company_tax_defaults_ad_bump_sync_version
AFTER DELETE ON company_tax_defaults
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (OLD.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `data_imports`
--

DROP TABLE IF EXISTS `data_imports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `data_imports` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `accounts_file_name` varchar(255) NOT NULL,
  `transactions_file_name` varchar(255) NOT NULL,
  `allocations_file_name` varchar(255) NOT NULL,
  `file_hash` char(64) NOT NULL,
  `status` varchar(16) NOT NULL,
  `counts_json` longtext DEFAULT NULL,
  `error_json` longtext DEFAULT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_data_imports_company_hash` (`company_id`,`file_hash`),
  KEY `fk_data_imports_created_by` (`created_by`),
  CONSTRAINT `fk_data_imports_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_data_imports_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_data_imports_counts_json` CHECK (`counts_json` is null or json_valid(`counts_json`)),
  CONSTRAINT `chk_data_imports_error_json` CHECK (`error_json` is null or json_valid(`error_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `data_imports`
--

LOCK TABLES `data_imports` WRITE;
/*!40000 ALTER TABLE `data_imports` DISABLE KEYS */;
/*!40000 ALTER TABLE `data_imports` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `email_outbox`
--

DROP TABLE IF EXISTS `email_outbox`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `email_outbox` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `to_email` varchar(191) NOT NULL,
  `subject` varchar(500) NOT NULL,
  `html` text NOT NULL,
  `text` text NOT NULL,
  `attachment_path` varchar(500) DEFAULT NULL,
  `status` enum('PENDING','SENDING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
  `error_message` text DEFAULT NULL,
  `attempts` int(10) unsigned NOT NULL DEFAULT 0,
  `next_retry_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `sent_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_email_outbox_status_next_retry` (`status`,`next_retry_at`),
  KEY `idx_email_outbox_company_id` (`company_id`),
  KEY `idx_email_outbox_created_at` (`created_at`),
  KEY `fk_email_outbox_user_id` (`user_id`),
  CONSTRAINT `fk_email_outbox_company_id` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_email_outbox_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `email_outbox`
--

LOCK TABLES `email_outbox` WRITE;
/*!40000 ALTER TABLE `email_outbox` DISABLE KEYS */;
/*!40000 ALTER TABLE `email_outbox` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `email_tokens`
--

DROP TABLE IF EXISTS `email_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `email_tokens` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `email` varchar(191) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `type` enum('PASSWORD_RESET','INVITE','VERIFY_EMAIL') NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_token_hash` (`token_hash`),
  KEY `idx_email_tokens_user_id` (`user_id`),
  KEY `idx_email_tokens_company_id` (`company_id`),
  KEY `idx_email_tokens_expires_at` (`expires_at`),
  KEY `idx_email_tokens_type` (`type`),
  KEY `fk_email_tokens_created_by` (`created_by`),
  CONSTRAINT `fk_email_tokens_company_id` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_email_tokens_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_email_tokens_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `email_tokens`
--

LOCK TABLES `email_tokens` WRITE;
/*!40000 ALTER TABLE `email_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `email_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `export_files`
--

DROP TABLE IF EXISTS `export_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `export_files` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `scheduled_export_id` bigint(20) unsigned DEFAULT NULL,
  `batch_job_id` varchar(36) DEFAULT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_size` bigint(20) unsigned NOT NULL,
  `file_path` varchar(500) NOT NULL COMMENT 'Local path or S3 key',
  `storage_provider` enum('LOCAL','S3') NOT NULL DEFAULT 'LOCAL',
  `expires_at` datetime DEFAULT NULL,
  `download_count` int(10) unsigned NOT NULL DEFAULT 0,
  `last_downloaded_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_export_files_company` (`company_id`),
  KEY `idx_export_files_expires` (`expires_at`),
  KEY `idx_export_files_scheduled` (`scheduled_export_id`),
  CONSTRAINT `export_files_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `export_files_ibfk_2` FOREIGN KEY (`scheduled_export_id`) REFERENCES `scheduled_exports` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `export_files`
--

LOCK TABLES `export_files` WRITE;
/*!40000 ALTER TABLE `export_files` DISABLE KEYS */;
/*!40000 ALTER TABLE `export_files` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `feature_flags`
--

DROP TABLE IF EXISTS `feature_flags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `feature_flags` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `key` varchar(64) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 0,
  `config_json` longtext NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_feature_flags_company_key` (`company_id`,`key`),
  CONSTRAINT `fk_feature_flags_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `chk_feature_flags_config_json` CHECK (json_valid(`config_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `feature_flags`
--

LOCK TABLES `feature_flags` WRITE;
/*!40000 ALTER TABLE `feature_flags` DISABLE KEYS */;
/*!40000 ALTER TABLE `feature_flags` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_feature_flags_ai_bump_sync_version
AFTER INSERT ON feature_flags
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_feature_flags_au_bump_sync_version
AFTER UPDATE ON feature_flags
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_feature_flags_ad_bump_sync_version
AFTER DELETE ON feature_flags
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (OLD.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `fiscal_years`
--

DROP TABLE IF EXISTS `fiscal_years`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `fiscal_years` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `code` varchar(32) NOT NULL,
  `name` varchar(191) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'OPEN',
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fiscal_years_company_code` (`company_id`,`code`),
  KEY `idx_fiscal_years_company_status` (`company_id`,`status`),
  KEY `idx_fiscal_years_company_start_date` (`company_id`,`start_date`),
  KEY `fk_fiscal_years_created_by_user` (`created_by_user_id`),
  KEY `fk_fiscal_years_updated_by_user` (`updated_by_user_id`),
  CONSTRAINT `fk_fiscal_years_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_fiscal_years_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fiscal_years_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_fiscal_years_date_range` CHECK (`start_date` <= `end_date`),
  CONSTRAINT `chk_fiscal_years_status` CHECK (`status` in ('OPEN','CLOSED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fiscal_years`
--

LOCK TABLES `fiscal_years` WRITE;
/*!40000 ALTER TABLE `fiscal_years` DISABLE KEYS */;
/*!40000 ALTER TABLE `fiscal_years` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fixed_asset_books`
--

DROP TABLE IF EXISTS `fixed_asset_books`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `fixed_asset_books` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `asset_id` bigint(20) unsigned NOT NULL,
  `cost_basis` decimal(18,2) NOT NULL DEFAULT 0.00,
  `accum_depreciation` decimal(18,2) NOT NULL DEFAULT 0.00,
  `accum_impairment` decimal(18,2) NOT NULL DEFAULT 0.00,
  `carrying_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `as_of_date` date NOT NULL,
  `last_event_id` bigint(20) unsigned NOT NULL,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fixed_asset_books_asset` (`asset_id`),
  KEY `idx_fixed_asset_books_company` (`company_id`),
  CONSTRAINT `fk_fixed_asset_books_asset` FOREIGN KEY (`asset_id`) REFERENCES `fixed_assets` (`id`),
  CONSTRAINT `fk_fixed_asset_books_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `chk_fixed_asset_books_non_negative` CHECK (`cost_basis` >= 0 and `accum_depreciation` >= 0 and `accum_impairment` >= 0 and `carrying_amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fixed_asset_books`
--

LOCK TABLES `fixed_asset_books` WRITE;
/*!40000 ALTER TABLE `fixed_asset_books` DISABLE KEYS */;
/*!40000 ALTER TABLE `fixed_asset_books` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fixed_asset_categories`
--

DROP TABLE IF EXISTS `fixed_asset_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `fixed_asset_categories` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `code` varchar(64) NOT NULL,
  `name` varchar(191) NOT NULL,
  `depreciation_method` varchar(32) NOT NULL DEFAULT 'STRAIGHT_LINE',
  `useful_life_months` int(10) unsigned NOT NULL,
  `residual_value_pct` decimal(5,2) NOT NULL DEFAULT 0.00,
  `expense_account_id` bigint(20) unsigned DEFAULT NULL,
  `accum_depr_account_id` bigint(20) unsigned DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fixed_asset_categories_company_code` (`company_id`,`code`),
  KEY `idx_fixed_asset_categories_company_active` (`company_id`,`is_active`),
  KEY `idx_fixed_asset_categories_company_updated` (`company_id`,`updated_at`),
  KEY `idx_fixed_asset_categories_expense_account` (`company_id`,`expense_account_id`),
  KEY `idx_fixed_asset_categories_accum_account` (`company_id`,`accum_depr_account_id`),
  KEY `fk_fixed_asset_categories_expense_account` (`expense_account_id`),
  KEY `fk_fixed_asset_categories_accum_account` (`accum_depr_account_id`),
  CONSTRAINT `fk_fixed_asset_categories_accum_account` FOREIGN KEY (`accum_depr_account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_fixed_asset_categories_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_fixed_asset_categories_expense_account` FOREIGN KEY (`expense_account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `chk_fixed_asset_categories_useful_life_positive` CHECK (`useful_life_months` > 0),
  CONSTRAINT `chk_fixed_asset_categories_residual_pct_range` CHECK (`residual_value_pct` >= 0 and `residual_value_pct` <= 100),
  CONSTRAINT `chk_fixed_asset_categories_method` CHECK (`depreciation_method` in ('STRAIGHT_LINE','DECLINING_BALANCE','SUM_OF_YEARS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fixed_asset_categories`
--

LOCK TABLES `fixed_asset_categories` WRITE;
/*!40000 ALTER TABLE `fixed_asset_categories` DISABLE KEYS */;
/*!40000 ALTER TABLE `fixed_asset_categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fixed_asset_disposals`
--

DROP TABLE IF EXISTS `fixed_asset_disposals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `fixed_asset_disposals` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `event_id` bigint(20) unsigned NOT NULL,
  `asset_id` bigint(20) unsigned NOT NULL,
  `proceeds` decimal(18,2) NOT NULL DEFAULT 0.00,
  `cost_removed` decimal(18,2) NOT NULL DEFAULT 0.00,
  `depr_removed` decimal(18,2) NOT NULL DEFAULT 0.00,
  `impairment_removed` decimal(18,2) NOT NULL DEFAULT 0.00,
  `disposal_cost` decimal(18,2) NOT NULL DEFAULT 0.00,
  `gain_loss` decimal(18,2) NOT NULL,
  `disposal_type` varchar(16) NOT NULL,
  `notes` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_fixed_asset_disposals_event` (`event_id`),
  KEY `idx_fixed_asset_disposals_asset` (`asset_id`),
  KEY `fk_fixed_asset_disposals_company` (`company_id`),
  CONSTRAINT `fk_fixed_asset_disposals_asset` FOREIGN KEY (`asset_id`) REFERENCES `fixed_assets` (`id`),
  CONSTRAINT `fk_fixed_asset_disposals_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_fixed_asset_disposals_event` FOREIGN KEY (`event_id`) REFERENCES `fixed_asset_events` (`id`),
  CONSTRAINT `chk_fixed_asset_disposals_type` CHECK (`disposal_type` in ('SALE','SCRAP'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fixed_asset_disposals`
--

LOCK TABLES `fixed_asset_disposals` WRITE;
/*!40000 ALTER TABLE `fixed_asset_disposals` DISABLE KEYS */;
/*!40000 ALTER TABLE `fixed_asset_disposals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fixed_asset_events`
--

DROP TABLE IF EXISTS `fixed_asset_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `fixed_asset_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `asset_id` bigint(20) unsigned NOT NULL,
  `event_type` varchar(32) NOT NULL,
  `event_date` date NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `journal_batch_id` bigint(20) unsigned DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'POSTED',
  `idempotency_key` varchar(64) NOT NULL,
  `event_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`event_data`)),
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_by` bigint(20) unsigned NOT NULL,
  `voided_by` bigint(20) unsigned DEFAULT NULL,
  `voided_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fixed_asset_events_company_key` (`company_id`,`idempotency_key`),
  KEY `idx_fixed_asset_events_asset` (`asset_id`),
  KEY `idx_fixed_asset_events_company_date` (`company_id`,`event_date`),
  KEY `idx_fixed_asset_events_journal` (`journal_batch_id`),
  KEY `fk_fixed_asset_events_outlet` (`outlet_id`),
  KEY `fk_fixed_asset_events_created_by` (`created_by`),
  CONSTRAINT `fk_fixed_asset_events_asset` FOREIGN KEY (`asset_id`) REFERENCES `fixed_assets` (`id`),
  CONSTRAINT `fk_fixed_asset_events_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_fixed_asset_events_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_fixed_asset_events_journal` FOREIGN KEY (`journal_batch_id`) REFERENCES `journal_batches` (`id`),
  CONSTRAINT `fk_fixed_asset_events_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `chk_fixed_asset_events_status` CHECK (`status` in ('POSTED','VOIDED')),
  CONSTRAINT `chk_fixed_asset_events_type` CHECK (`event_type` in ('ACQUISITION','FA_ACQUISITION','DEPRECIATION','TRANSFER','IMPAIRMENT','DISPOSAL','FA_DISPOSAL','VOID'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fixed_asset_events`
--

LOCK TABLES `fixed_asset_events` WRITE;
/*!40000 ALTER TABLE `fixed_asset_events` DISABLE KEYS */;
/*!40000 ALTER TABLE `fixed_asset_events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fixed_assets`
--

DROP TABLE IF EXISTS `fixed_assets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `fixed_assets` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `category_id` bigint(20) unsigned DEFAULT NULL,
  `asset_tag` varchar(64) DEFAULT NULL,
  `name` varchar(191) NOT NULL,
  `serial_number` varchar(128) DEFAULT NULL,
  `purchase_date` date DEFAULT NULL,
  `purchase_cost` decimal(18,2) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `disposed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fixed_assets_company_asset_tag` (`company_id`,`asset_tag`),
  KEY `idx_fixed_assets_company_outlet` (`company_id`,`outlet_id`),
  KEY `idx_fixed_assets_company_active` (`company_id`,`is_active`),
  KEY `idx_fixed_assets_company_updated` (`company_id`,`updated_at`),
  KEY `fk_fixed_assets_outlet` (`outlet_id`),
  KEY `idx_fixed_assets_company_category` (`company_id`,`category_id`),
  KEY `fk_fixed_assets_category` (`category_id`),
  KEY `idx_fixed_assets_disposed` (`disposed_at`),
  CONSTRAINT `fk_fixed_assets_category` FOREIGN KEY (`category_id`) REFERENCES `fixed_asset_categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fixed_assets_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_fixed_assets_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `chk_fixed_assets_purchase_cost_non_negative` CHECK (`purchase_cost` is null or `purchase_cost` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fixed_assets`
--

LOCK TABLES `fixed_assets` WRITE;
/*!40000 ALTER TABLE `fixed_assets` DISABLE KEYS */;
/*!40000 ALTER TABLE `fixed_assets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory_stock`
--

DROP TABLE IF EXISTS `inventory_stock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inventory_stock` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `product_id` bigint(20) unsigned NOT NULL,
  `quantity` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `reserved_quantity` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `available_quantity` decimal(15,4) NOT NULL DEFAULT 0.0000,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `outlet_id_is_null` tinyint(1) GENERATED ALWAYS AS (case when `outlet_id` is null then 1 else 0 end) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventory_stock_company_outlet_product` (`company_id`,`outlet_id`,`product_id`),
  UNIQUE KEY `uq_inventory_stock_company_wide` (`company_id`,`product_id`,`outlet_id_is_null`),
  KEY `idx_inventory_stock_company_product` (`company_id`,`product_id`),
  KEY `idx_inventory_stock_outlet` (`outlet_id`),
  KEY `idx_inventory_stock_company_updated` (`company_id`,`updated_at`),
  KEY `fk_inventory_stock_product` (`product_id`),
  CONSTRAINT `fk_inventory_stock_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_inventory_stock_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_inventory_stock_product` FOREIGN KEY (`product_id`) REFERENCES `items` (`id`),
  CONSTRAINT `chk_inventory_stock_quantity_non_negative` CHECK (`quantity` >= 0),
  CONSTRAINT `chk_inventory_stock_reserved_non_negative` CHECK (`reserved_quantity` >= 0),
  CONSTRAINT `chk_inventory_stock_available_non_negative` CHECK (`available_quantity` >= 0),
  CONSTRAINT `chk_inventory_stock_available_formula` CHECK (`available_quantity` = `quantity` - `reserved_quantity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_stock`
--

LOCK TABLES `inventory_stock` WRITE;
/*!40000 ALTER TABLE `inventory_stock` DISABLE KEYS */;
/*!40000 ALTER TABLE `inventory_stock` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inventory_transactions`
--

DROP TABLE IF EXISTS `inventory_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inventory_transactions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `product_id` bigint(20) unsigned NOT NULL,
  `transaction_type` tinyint(3) unsigned NOT NULL COMMENT 'Transaction type: 1=SALE,2=REFUND,3=RESERVATION,4=RELEASE,5=ADJUSTMENT,6=RECEIPT,7=TRANSFER',
  `quantity_delta` decimal(15,4) NOT NULL,
  `reference_type` varchar(64) DEFAULT NULL,
  `reference_id` varchar(64) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_inventory_transactions_company_created` (`company_id`,`created_at`),
  KEY `idx_inventory_transactions_product_created` (`product_id`,`created_at`),
  KEY `idx_inventory_transactions_company_product` (`company_id`,`product_id`),
  KEY `idx_inventory_transactions_outlet` (`outlet_id`),
  KEY `idx_inventory_transactions_type` (`transaction_type`),
  KEY `idx_inventory_transactions_reference` (`reference_type`,`reference_id`),
  KEY `idx_inventory_transactions_created_by` (`created_by`),
  KEY `idx_inventory_transactions_company_type_created` (`company_id`,`transaction_type`,`created_at`),
  CONSTRAINT `fk_inventory_transactions_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_inventory_transactions_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_inventory_transactions_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_inventory_transactions_product` FOREIGN KEY (`product_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inventory_transactions`
--

LOCK TABLES `inventory_transactions` WRITE;
/*!40000 ALTER TABLE `inventory_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `inventory_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `item_groups`
--

DROP TABLE IF EXISTS `item_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `item_groups` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `parent_id` bigint(20) unsigned DEFAULT NULL,
  `code` varchar(64) DEFAULT NULL,
  `name` varchar(191) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_item_groups_company_code` (`company_id`,`code`),
  KEY `idx_item_groups_company_active` (`company_id`,`is_active`),
  KEY `idx_item_groups_company_updated` (`company_id`,`updated_at`),
  KEY `idx_item_groups_company_parent` (`company_id`,`parent_id`),
  KEY `fk_item_groups_parent` (`parent_id`),
  CONSTRAINT `fk_item_groups_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_item_groups_parent` FOREIGN KEY (`parent_id`) REFERENCES `item_groups` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `item_groups`
--

LOCK TABLES `item_groups` WRITE;
/*!40000 ALTER TABLE `item_groups` DISABLE KEYS */;
/*!40000 ALTER TABLE `item_groups` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_item_groups_ai_bump_sync_version
AFTER INSERT ON item_groups
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_item_groups_au_bump_sync_version
AFTER UPDATE ON item_groups
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_item_groups_ad_bump_sync_version
AFTER DELETE ON item_groups
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (OLD.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `item_prices`
--

DROP TABLE IF EXISTS `item_prices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `item_prices` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL COMMENT 'NULL = company default price, non-NULL = outlet override',
  `item_id` bigint(20) unsigned NOT NULL,
  `price` decimal(18,2) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `scope_key` varchar(100) GENERATED ALWAYS AS (case when `outlet_id` is null then concat('default:',`company_id`,':',`item_id`) else concat('override:',`company_id`,':',`outlet_id`,':',`item_id`) end) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_item_prices_scope` (`scope_key`),
  KEY `idx_item_prices_company_updated` (`company_id`,`updated_at`),
  KEY `fk_item_prices_outlet` (`outlet_id`),
  KEY `fk_item_prices_item` (`item_id`),
  KEY `idx_item_prices_company_item` (`company_id`,`item_id`),
  KEY `idx_item_prices_company_outlet_fk` (`company_id`,`outlet_id`),
  KEY `idx_item_prices_outlet_item_active` (`company_id`,`outlet_id`,`item_id`,`is_active`),
  KEY `idx_item_prices_company_default_fallback` (`company_id`,`item_id`,`is_active`),
  CONSTRAINT `fk_item_prices_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_item_prices_company_item_scoped` FOREIGN KEY (`company_id`, `item_id`) REFERENCES `items` (`company_id`, `id`) ON DELETE CASCADE,
  CONSTRAINT `fk_item_prices_company_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `chk_item_prices_price_non_negative` CHECK (`price` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='Item prices: outlet_id=NULL for company default, outlet_id=N for outlet override. Effective price resolution: override > default.';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `item_prices`
--

LOCK TABLES `item_prices` WRITE;
/*!40000 ALTER TABLE `item_prices` DISABLE KEYS */;
/*!40000 ALTER TABLE `item_prices` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_item_prices_ai_bump_sync_version
AFTER INSERT ON item_prices
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'MASTER,OPERATIONAL') */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_item_prices_au_bump_sync_version
AFTER UPDATE ON item_prices
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'MASTER,OPERATIONAL') */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_item_prices_ad_bump_sync_version
AFTER DELETE ON item_prices
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (OLD.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `items`
--

DROP TABLE IF EXISTS `items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `sku` varchar(64) DEFAULT NULL,
  `name` varchar(191) NOT NULL,
  `item_type` varchar(16) NOT NULL,
  `item_group_id` bigint(20) unsigned DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `track_stock` tinyint(1) NOT NULL DEFAULT 0,
  `low_stock_threshold` decimal(15,4) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_items_company_sku` (`company_id`,`sku`),
  KEY `idx_items_company_active` (`company_id`,`is_active`),
  KEY `idx_items_company_updated` (`company_id`,`updated_at`),
  KEY `idx_items_company_id_id` (`company_id`,`id`),
  KEY `idx_items_company_active_id` (`company_id`,`is_active`,`id`),
  KEY `idx_items_company_group` (`company_id`,`item_group_id`),
  KEY `fk_items_group` (`item_group_id`),
  KEY `idx_items_track_stock` (`company_id`,`track_stock`),
  KEY `idx_items_low_stock_threshold` (`company_id`,`low_stock_threshold`),
  CONSTRAINT `fk_items_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_items_group` FOREIGN KEY (`item_group_id`) REFERENCES `item_groups` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_items_type` CHECK (`item_type` in ('SERVICE','PRODUCT','INGREDIENT','RECIPE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `items`
--

LOCK TABLES `items` WRITE;
/*!40000 ALTER TABLE `items` DISABLE KEYS */;
/*!40000 ALTER TABLE `items` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_items_ai_bump_sync_version
AFTER INSERT ON items
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'MASTER') */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_items_au_bump_sync_version
AFTER UPDATE ON items
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'MASTER') */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_items_ad_bump_sync_version
AFTER DELETE ON items
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (OLD.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `journal_batches`
--

DROP TABLE IF EXISTS `journal_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `journal_batches`
--

LOCK TABLES `journal_batches` WRITE;
/*!40000 ALTER TABLE `journal_batches` DISABLE KEYS */;
/*!40000 ALTER TABLE `journal_batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `journal_lines`
--

DROP TABLE IF EXISTS `journal_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `journal_lines`
--

LOCK TABLES `journal_lines` WRITE;
/*!40000 ALTER TABLE `journal_lines` DISABLE KEYS */;
/*!40000 ALTER TABLE `journal_lines` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `module_roles`
--

DROP TABLE IF EXISTS `module_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `module_roles` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `role_id` bigint(20) unsigned NOT NULL,
  `module` varchar(64) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `permission_mask` int(11) NOT NULL DEFAULT 0 COMMENT 'Permission bits: create=1, read=2, update=4, delete=8',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_module_roles_company_role_module` (`company_id`,`role_id`,`module`),
  KEY `idx_module_roles_module` (`module`),
  KEY `idx_module_roles_role_id` (`role_id`),
  KEY `idx_module_roles_company_module` (`company_id`,`module`),
  CONSTRAINT `fk_module_roles_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_module_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `module_roles`
--

LOCK TABLES `module_roles` WRITE;
/*!40000 ALTER TABLE `module_roles` DISABLE KEYS */;
/*!40000 ALTER TABLE `module_roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `modules`
--

DROP TABLE IF EXISTS `modules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `modules` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL,
  `name` varchar(191) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_modules_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `modules`
--

LOCK TABLES `modules` WRITE;
/*!40000 ALTER TABLE `modules` DISABLE KEYS */;
INSERT INTO `modules` VALUES
(1,'pos','POS','Point of sale','2026-03-16 15:44:31','2026-03-16 15:44:31');
/*!40000 ALTER TABLE `modules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `numbering_templates`
--

DROP TABLE IF EXISTS `numbering_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `numbering_templates`
--

LOCK TABLES `numbering_templates` WRITE;
/*!40000 ALTER TABLE `numbering_templates` DISABLE KEYS */;
/*!40000 ALTER TABLE `numbering_templates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `outlet_account_mappings`
--

DROP TABLE IF EXISTS `outlet_account_mappings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `outlet_account_mappings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `mapping_key` varchar(64) NOT NULL,
  `account_id` bigint(20) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_outlet_account_mappings_scope_key` (`company_id`,`outlet_id`,`mapping_key`),
  KEY `idx_outlet_account_mappings_scope_account` (`company_id`,`outlet_id`,`account_id`),
  KEY `fk_outlet_account_mappings_account_scoped` (`company_id`,`account_id`),
  CONSTRAINT `fk_outlet_account_mappings_account_scoped` FOREIGN KEY (`company_id`, `account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `fk_outlet_account_mappings_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_outlet_account_mappings_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `chk_outlet_account_mappings_mapping_key` CHECK (`mapping_key` in ('CASH','QRIS','CARD','SALES_REVENUE','SALES_RETURNS','AR','INVOICE_PAYMENT_BANK'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `outlet_account_mappings`
--

LOCK TABLES `outlet_account_mappings` WRITE;
/*!40000 ALTER TABLE `outlet_account_mappings` DISABLE KEYS */;
/*!40000 ALTER TABLE `outlet_account_mappings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `outlet_payment_method_mappings`
--

DROP TABLE IF EXISTS `outlet_payment_method_mappings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `outlet_payment_method_mappings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `method_code` varchar(64) NOT NULL,
  `label` varchar(191) DEFAULT NULL,
  `account_id` bigint(20) unsigned NOT NULL,
  `is_invoice_default` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_outlet_payment_method_scope` (`company_id`,`outlet_id`,`method_code`),
  KEY `idx_outlet_payment_method_account` (`company_id`,`outlet_id`,`account_id`),
  KEY `fk_outlet_payment_method_account` (`company_id`,`account_id`),
  KEY `idx_outlet_payment_invoice_default` (`company_id`,`outlet_id`,`is_invoice_default`),
  CONSTRAINT `fk_outlet_payment_method_account` FOREIGN KEY (`company_id`, `account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `fk_outlet_payment_method_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_outlet_payment_method_outlet` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `outlet_payment_method_mappings`
--

LOCK TABLES `outlet_payment_method_mappings` WRITE;
/*!40000 ALTER TABLE `outlet_payment_method_mappings` DISABLE KEYS */;
/*!40000 ALTER TABLE `outlet_payment_method_mappings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `outlet_tables`
--

DROP TABLE IF EXISTS `outlet_tables`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `outlet_tables` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `code` varchar(32) NOT NULL,
  `name` varchar(191) NOT NULL,
  `zone` varchar(64) DEFAULT NULL,
  `capacity` int(10) unsigned DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'AVAILABLE',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_outlet_tables_outlet_code` (`company_id`,`outlet_id`,`code`),
  KEY `idx_outlet_tables_company_outlet_id` (`company_id`,`outlet_id`,`id`),
  KEY `idx_outlet_tables_company_outlet_status` (`company_id`,`outlet_id`,`status`),
  CONSTRAINT `fk_outlet_tables_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_outlet_tables_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `chk_outlet_tables_status` CHECK (`status` in ('AVAILABLE','RESERVED','OCCUPIED','UNAVAILABLE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `outlet_tables`
--

LOCK TABLES `outlet_tables` WRITE;
/*!40000 ALTER TABLE `outlet_tables` DISABLE KEYS */;
/*!40000 ALTER TABLE `outlet_tables` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_outlet_tables_ai_bump_sync_version
AFTER INSERT ON outlet_tables
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'OPERATIONAL,REALTIME') */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_outlet_tables_au_bump_sync_version
AFTER UPDATE ON outlet_tables
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'OPERATIONAL,REALTIME') */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `outlets`
--

DROP TABLE IF EXISTS `outlets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `outlets` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `code` varchar(32) NOT NULL,
  `name` varchar(191) NOT NULL,
  `city` varchar(96) DEFAULT NULL,
  `address_line1` varchar(191) DEFAULT NULL,
  `address_line2` varchar(191) DEFAULT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `phone` varchar(32) DEFAULT NULL,
  `email` varchar(191) DEFAULT NULL,
  `timezone` varchar(64) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_outlets_company_code` (`company_id`,`code`),
  KEY `idx_outlets_company_id_id` (`company_id`,`id`),
  KEY `idx_outlets_company_is_active` (`company_id`,`is_active`),
  KEY `idx_outlets_company_city` (`company_id`,`city`),
  CONSTRAINT `fk_outlets_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `outlets`
--

LOCK TABLES `outlets` WRITE;
/*!40000 ALTER TABLE `outlets` DISABLE KEYS */;
/*!40000 ALTER TABLE `outlets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `platform_settings`
--

DROP TABLE IF EXISTS `platform_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `platform_settings` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `key` varchar(128) NOT NULL,
  `value_json` text NOT NULL,
  `is_sensitive` tinyint(1) NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `updated_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_key` (`key`),
  KEY `idx_updated_at` (`updated_at`),
  KEY `fk_platform_settings_updated_by` (`updated_by`),
  CONSTRAINT `fk_platform_settings_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `platform_settings`
--

LOCK TABLES `platform_settings` WRITE;
/*!40000 ALTER TABLE `platform_settings` DISABLE KEYS */;
/*!40000 ALTER TABLE `platform_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pos_item_cancellations`
--

DROP TABLE IF EXISTS `pos_item_cancellations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pos_item_cancellations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `cancellation_id` char(36) NOT NULL,
  `update_id` char(36) DEFAULT NULL,
  `order_id` char(36) NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `item_id` bigint(20) unsigned NOT NULL,
  `cancelled_quantity` decimal(18,4) NOT NULL,
  `reason` varchar(500) NOT NULL,
  `cancelled_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `cancelled_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_item_cancellations_cancellation_id` (`cancellation_id`),
  KEY `idx_pos_item_cancellations_scope_order_time` (`company_id`,`outlet_id`,`order_id`,`cancelled_at`),
  KEY `idx_pos_item_cancellations_update_id` (`update_id`),
  KEY `fk_pos_item_cancellations_order_snapshot` (`order_id`),
  KEY `fk_pos_item_cancellations_outlet` (`outlet_id`),
  KEY `fk_pos_item_cancellations_actor` (`cancelled_by_user_id`),
  CONSTRAINT `fk_pos_item_cancellations_actor` FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_pos_item_cancellations_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_pos_item_cancellations_order_snapshot` FOREIGN KEY (`order_id`) REFERENCES `pos_order_snapshots` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pos_item_cancellations_order_update` FOREIGN KEY (`update_id`) REFERENCES `pos_order_updates` (`update_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pos_item_cancellations_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `chk_pos_item_cancellations_cancelled_quantity` CHECK (`cancelled_quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pos_item_cancellations`
--

LOCK TABLES `pos_item_cancellations` WRITE;
/*!40000 ALTER TABLE `pos_item_cancellations` DISABLE KEYS */;
/*!40000 ALTER TABLE `pos_item_cancellations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pos_order_snapshot_lines`
--

DROP TABLE IF EXISTS `pos_order_snapshot_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pos_order_snapshot_lines` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `order_id` char(36) NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `item_id` bigint(20) unsigned NOT NULL,
  `sku_snapshot` varchar(191) DEFAULT NULL,
  `name_snapshot` varchar(191) NOT NULL,
  `item_type_snapshot` varchar(16) NOT NULL,
  `unit_price_snapshot` decimal(18,2) NOT NULL,
  `qty` decimal(18,4) NOT NULL,
  `discount_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `updated_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_order_snapshot_lines_order_item` (`order_id`,`item_id`),
  KEY `idx_pos_order_snapshot_lines_scope_order` (`company_id`,`outlet_id`,`order_id`),
  KEY `fk_pos_order_snapshot_lines_outlet` (`outlet_id`),
  CONSTRAINT `fk_pos_order_snapshot_lines_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_pos_order_snapshot_lines_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_pos_order_snapshot_lines_snapshot` FOREIGN KEY (`order_id`) REFERENCES `pos_order_snapshots` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_pos_order_snapshot_lines_item_type` CHECK (`item_type_snapshot` in ('SERVICE','PRODUCT','INGREDIENT','RECIPE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pos_order_snapshot_lines`
--

LOCK TABLES `pos_order_snapshot_lines` WRITE;
/*!40000 ALTER TABLE `pos_order_snapshot_lines` DISABLE KEYS */;
/*!40000 ALTER TABLE `pos_order_snapshot_lines` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pos_order_snapshots`
--

DROP TABLE IF EXISTS `pos_order_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pos_order_snapshots`
--

LOCK TABLES `pos_order_snapshots` WRITE;
/*!40000 ALTER TABLE `pos_order_snapshots` DISABLE KEYS */;
/*!40000 ALTER TABLE `pos_order_snapshots` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pos_order_updates`
--

DROP TABLE IF EXISTS `pos_order_updates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pos_order_updates` (
  `sequence_no` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `update_id` char(36) NOT NULL,
  `order_id` char(36) NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `base_order_updated_at` datetime DEFAULT NULL,
  `event_type` varchar(32) NOT NULL,
  `delta_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`delta_json`)),
  `actor_user_id` bigint(20) unsigned DEFAULT NULL,
  `device_id` varchar(191) NOT NULL,
  `event_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`sequence_no`),
  UNIQUE KEY `uq_pos_order_updates_update_id` (`update_id`),
  KEY `idx_pos_order_updates_scope_seq` (`company_id`,`outlet_id`,`sequence_no`),
  KEY `idx_pos_order_updates_scope_order_event` (`company_id`,`outlet_id`,`order_id`,`event_at`),
  KEY `fk_pos_order_updates_snapshot` (`order_id`),
  KEY `fk_pos_order_updates_outlet` (`outlet_id`),
  KEY `fk_pos_order_updates_actor` (`actor_user_id`),
  CONSTRAINT `fk_pos_order_updates_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_pos_order_updates_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_pos_order_updates_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_pos_order_updates_snapshot` FOREIGN KEY (`order_id`) REFERENCES `pos_order_snapshots` (`order_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_pos_order_updates_event_type` CHECK (`event_type` in ('SNAPSHOT_FINALIZED','ITEM_ADDED','ITEM_REMOVED','QTY_CHANGED','ITEM_CANCELLED','NOTES_CHANGED','ORDER_RESUMED','ORDER_CLOSED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pos_order_updates`
--

LOCK TABLES `pos_order_updates` WRITE;
/*!40000 ALTER TABLE `pos_order_updates` DISABLE KEYS */;
/*!40000 ALTER TABLE `pos_order_updates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pos_sync_metadata`
--

DROP TABLE IF EXISTS `pos_sync_metadata`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pos_sync_metadata` (
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `tier` enum('REALTIME','OPERATIONAL','MASTER','ADMIN') NOT NULL,
  `last_sync_at` datetime DEFAULT NULL,
  `last_version` bigint(20) unsigned DEFAULT NULL,
  `sync_status` enum('OK','ERROR','STALE') NOT NULL DEFAULT 'OK',
  `error_message` text DEFAULT NULL,
  `sync_frequency_ms` int(10) unsigned DEFAULT NULL COMMENT 'Override default frequency for this outlet/tier',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`company_id`,`outlet_id`,`tier`),
  KEY `idx_pos_sync_metadata_company` (`company_id`),
  KEY `idx_pos_sync_metadata_outlet` (`outlet_id`),
  KEY `idx_pos_sync_metadata_status` (`sync_status`),
  KEY `idx_pos_sync_metadata_sync_at` (`last_sync_at`),
  CONSTRAINT `pos_sync_metadata_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pos_sync_metadata_ibfk_2` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pos_sync_metadata`
--

LOCK TABLES `pos_sync_metadata` WRITE;
/*!40000 ALTER TABLE `pos_sync_metadata` DISABLE KEYS */;
/*!40000 ALTER TABLE `pos_sync_metadata` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pos_transaction_items`
--

DROP TABLE IF EXISTS `pos_transaction_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pos_transaction_items` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `pos_transaction_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `line_no` int(10) unsigned NOT NULL,
  `item_id` bigint(20) unsigned NOT NULL,
  `qty` decimal(18,4) NOT NULL,
  `price_snapshot` decimal(18,2) NOT NULL,
  `name_snapshot` varchar(191) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_transaction_items_tx_line` (`pos_transaction_id`,`line_no`),
  KEY `idx_pos_transaction_items_company_created_at` (`company_id`,`created_at`),
  KEY `idx_pos_transaction_items_outlet_created_at` (`outlet_id`,`created_at`),
  CONSTRAINT `fk_pos_transaction_items_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_pos_transaction_items_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_pos_transaction_items_tx` FOREIGN KEY (`pos_transaction_id`) REFERENCES `pos_transactions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pos_transaction_items`
--

LOCK TABLES `pos_transaction_items` WRITE;
/*!40000 ALTER TABLE `pos_transaction_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `pos_transaction_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pos_transaction_payments`
--

DROP TABLE IF EXISTS `pos_transaction_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pos_transaction_payments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `pos_transaction_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `payment_no` int(10) unsigned NOT NULL,
  `method` varchar(64) NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_transaction_payments_tx_payment` (`pos_transaction_id`,`payment_no`),
  KEY `idx_pos_transaction_payments_company_created_at` (`company_id`,`created_at`),
  KEY `idx_pos_transaction_payments_outlet_created_at` (`outlet_id`,`created_at`),
  CONSTRAINT `fk_pos_transaction_payments_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_pos_transaction_payments_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_pos_transaction_payments_tx` FOREIGN KEY (`pos_transaction_id`) REFERENCES `pos_transactions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pos_transaction_payments`
--

LOCK TABLES `pos_transaction_payments` WRITE;
/*!40000 ALTER TABLE `pos_transaction_payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `pos_transaction_payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pos_transaction_taxes`
--

DROP TABLE IF EXISTS `pos_transaction_taxes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pos_transaction_taxes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `pos_transaction_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `tax_rate_id` bigint(20) unsigned NOT NULL,
  `amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_transaction_taxes_tx_rate` (`pos_transaction_id`,`tax_rate_id`),
  KEY `idx_pos_transaction_taxes_company_outlet` (`company_id`,`outlet_id`),
  KEY `idx_pos_transaction_taxes_tax_rate` (`tax_rate_id`),
  CONSTRAINT `fk_pos_transaction_taxes_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_pos_transaction_taxes_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `fk_pos_transaction_taxes_tax_rate` FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates` (`id`),
  CONSTRAINT `fk_pos_transaction_taxes_tx` FOREIGN KEY (`pos_transaction_id`) REFERENCES `pos_transactions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_pos_transaction_taxes_amount_non_negative` CHECK (`amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pos_transaction_taxes`
--

LOCK TABLES `pos_transaction_taxes` WRITE;
/*!40000 ALTER TABLE `pos_transaction_taxes` DISABLE KEYS */;
/*!40000 ALTER TABLE `pos_transaction_taxes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `pos_transactions`
--

DROP TABLE IF EXISTS `pos_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `pos_transactions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `cashier_user_id` bigint(20) unsigned DEFAULT NULL,
  `client_tx_id` char(36) NOT NULL,
  `status` varchar(16) NOT NULL,
  `trx_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `payload_sha256` char(64) NOT NULL DEFAULT '',
  `payload_hash_version` tinyint(3) unsigned NOT NULL DEFAULT 1,
  `service_type` varchar(16) NOT NULL DEFAULT 'TAKEAWAY',
  `table_id` bigint(20) unsigned DEFAULT NULL,
  `reservation_id` bigint(20) unsigned DEFAULT NULL,
  `guest_count` int(10) unsigned DEFAULT NULL,
  `order_status` varchar(16) NOT NULL DEFAULT 'COMPLETED',
  `opened_at` datetime DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `discount_percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  `discount_fixed` decimal(18,2) NOT NULL DEFAULT 0.00,
  `discount_code` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pos_transactions_client_tx_id` (`company_id`,`client_tx_id`),
  KEY `idx_pos_transactions_outlet_trx_at` (`outlet_id`,`trx_at`),
  KEY `idx_pos_transactions_company_trx_status` (`company_id`,`trx_at`,`status`,`id`),
  KEY `idx_pos_transactions_company_outlet_trx` (`company_id`,`outlet_id`,`trx_at`,`status`),
  KEY `idx_pos_transactions_company_outlet_cashier_trx` (`company_id`,`outlet_id`,`cashier_user_id`,`trx_at`,`id`),
  KEY `fk_pos_transactions_cashier_user` (`cashier_user_id`),
  KEY `idx_pos_transactions_company_outlet_service` (`company_id`,`outlet_id`,`service_type`,`trx_at`,`id`),
  KEY `idx_pos_transactions_company_outlet_reservation` (`company_id`,`outlet_id`,`reservation_id`),
  KEY `idx_pos_transactions_company_outlet_table` (`company_id`,`outlet_id`,`table_id`),
  KEY `idx_pos_transactions_discounts` (`company_id`,`trx_at`),
  CONSTRAINT `fk_pos_transactions_cashier_user` FOREIGN KEY (`cashier_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pos_transactions_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_pos_transactions_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`),
  CONSTRAINT `fk_pos_transactions_reservation_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `reservation_id`) REFERENCES `reservations` (`company_id`, `outlet_id`, `id`),
  CONSTRAINT `fk_pos_transactions_table_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `table_id`) REFERENCES `outlet_tables` (`company_id`, `outlet_id`, `id`),
  CONSTRAINT `chk_pos_transactions_status` CHECK (`status` in ('COMPLETED','VOID','REFUND')),
  CONSTRAINT `chk_pos_transactions_service_type` CHECK (`service_type` in ('TAKEAWAY','DINE_IN')),
  CONSTRAINT `chk_pos_transactions_order_status` CHECK (`order_status` in ('OPEN','READY_TO_PAY','COMPLETED','CANCELLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `pos_transactions`
--

LOCK TABLES `pos_transactions` WRITE;
/*!40000 ALTER TABLE `pos_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `pos_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reservations`
--

DROP TABLE IF EXISTS `reservations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reservations`
--

LOCK TABLES `reservations` WRITE;
/*!40000 ALTER TABLE `reservations` DISABLE KEYS */;
/*!40000 ALTER TABLE `reservations` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_reservations_ai_bump_sync_version
AFTER INSERT ON reservations
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'OPERATIONAL') */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_reservations_au_bump_sync_version
AFTER UPDATE ON reservations
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'OPERATIONAL') */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `roles` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL,
  `name` varchar(191) NOT NULL,
  `is_global` tinyint(1) NOT NULL DEFAULT 0,
  `role_level` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `company_id` bigint(20) unsigned DEFAULT NULL COMMENT 'NULL = system role, non-NULL = custom company role',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_company_code` (`company_id`,`code`),
  KEY `idx_roles_company_id` (`company_id`),
  CONSTRAINT `fk_roles_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='Roles: company_id=NULL for system roles, company_id=N for custom company roles. Unique within company.';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES
(1,'SUPER_ADMIN','Super Admin',1,100,'2026-03-16 15:44:26','2026-03-16 15:44:26',NULL),
(2,'OWNER','Owner',1,90,'2026-03-16 15:44:26','2026-03-16 15:44:26',NULL),
(3,'COMPANY_ADMIN','Company Admin',1,80,'2026-03-16 15:44:26','2026-03-16 15:44:26',NULL),
(4,'ADMIN','Admin',0,60,'2026-03-16 15:44:26','2026-03-16 15:44:26',NULL),
(5,'ACCOUNTANT','Accountant',0,40,'2026-03-16 15:44:26','2026-03-16 15:44:26',NULL),
(6,'CASHIER','Cashier',0,20,'2026-03-16 15:44:26','2026-03-16 15:44:26',NULL);
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_credit_note_lines`
--

DROP TABLE IF EXISTS `sales_credit_note_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_credit_note_lines` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `credit_note_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `line_no` int(10) unsigned NOT NULL,
  `description` varchar(255) NOT NULL,
  `qty` decimal(18,4) NOT NULL,
  `unit_price` decimal(18,2) NOT NULL,
  `line_total` decimal(18,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_credit_note_lines_credit_note_line_no` (`credit_note_id`,`line_no`),
  KEY `idx_sales_credit_note_lines_company_created_at` (`company_id`,`created_at`),
  KEY `idx_sales_credit_note_lines_outlet_created_at` (`outlet_id`,`created_at`),
  KEY `idx_sales_credit_note_lines_scope_credit_note` (`company_id`,`outlet_id`,`credit_note_id`),
  CONSTRAINT `fk_sales_credit_note_lines_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_sales_credit_note_lines_credit_note_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `credit_note_id`) REFERENCES `sales_credit_notes` (`company_id`, `outlet_id`, `id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_credit_note_lines_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `chk_sales_credit_note_lines_qty_positive` CHECK (`qty` > 0),
  CONSTRAINT `chk_sales_credit_note_lines_unit_price_non_negative` CHECK (`unit_price` >= 0),
  CONSTRAINT `chk_sales_credit_note_lines_line_total_non_negative` CHECK (`line_total` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_credit_note_lines`
--

LOCK TABLES `sales_credit_note_lines` WRITE;
/*!40000 ALTER TABLE `sales_credit_note_lines` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_credit_note_lines` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_credit_notes`
--

DROP TABLE IF EXISTS `sales_credit_notes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_credit_notes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `invoice_id` bigint(20) unsigned NOT NULL,
  `credit_note_no` varchar(64) NOT NULL,
  `credit_note_date` date NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'DRAFT',
  `reason` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `client_ref` char(36) DEFAULT NULL,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_credit_notes_company_credit_note_no` (`company_id`,`credit_note_no`),
  UNIQUE KEY `uq_sales_credit_notes_company_client_ref` (`company_id`,`client_ref`),
  KEY `idx_sales_credit_notes_company_credit_note_date` (`company_id`,`credit_note_date`),
  KEY `idx_sales_credit_notes_outlet_credit_note_date` (`outlet_id`,`credit_note_date`),
  KEY `idx_sales_credit_notes_company_status` (`company_id`,`status`),
  KEY `idx_sales_credit_notes_scope_id` (`company_id`,`outlet_id`,`id`),
  KEY `idx_sales_credit_notes_invoice_id` (`invoice_id`),
  KEY `fk_sales_credit_notes_invoice_scoped` (`company_id`,`outlet_id`,`invoice_id`),
  KEY `fk_sales_credit_notes_created_by_user` (`created_by_user_id`),
  KEY `fk_sales_credit_notes_updated_by_user` (`updated_by_user_id`),
  CONSTRAINT `fk_sales_credit_notes_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_sales_credit_notes_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sales_credit_notes_invoice_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `invoice_id`) REFERENCES `sales_invoices` (`company_id`, `outlet_id`, `id`),
  CONSTRAINT `fk_sales_credit_notes_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `fk_sales_credit_notes_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_sales_credit_notes_status` CHECK (`status` in ('DRAFT','POSTED','VOID')),
  CONSTRAINT `chk_sales_credit_notes_amount_non_negative` CHECK (`amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_credit_notes`
--

LOCK TABLES `sales_credit_notes` WRITE;
/*!40000 ALTER TABLE `sales_credit_notes` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_credit_notes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_forecasts`
--

DROP TABLE IF EXISTS `sales_forecasts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_forecasts`
--

LOCK TABLES `sales_forecasts` WRITE;
/*!40000 ALTER TABLE `sales_forecasts` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_forecasts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_invoice_lines`
--

DROP TABLE IF EXISTS `sales_invoice_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_invoice_lines` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `invoice_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `line_no` int(10) unsigned NOT NULL,
  `line_type` varchar(16) NOT NULL DEFAULT 'SERVICE',
  `item_id` bigint(20) unsigned DEFAULT NULL,
  `description` varchar(255) NOT NULL,
  `qty` decimal(18,4) NOT NULL,
  `unit_price` decimal(18,2) NOT NULL,
  `line_total` decimal(18,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_invoice_lines_invoice_line_no` (`invoice_id`,`line_no`),
  KEY `idx_sales_invoice_lines_company_created_at` (`company_id`,`created_at`),
  KEY `idx_sales_invoice_lines_outlet_created_at` (`outlet_id`,`created_at`),
  KEY `idx_sales_invoice_lines_scope_invoice` (`company_id`,`outlet_id`,`invoice_id`),
  KEY `idx_sales_invoice_lines_item_id` (`item_id`),
  KEY `idx_sales_invoice_lines_company_item` (`company_id`,`item_id`),
  CONSTRAINT `fk_sales_invoice_lines_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_sales_invoice_lines_invoice_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `invoice_id`) REFERENCES `sales_invoices` (`company_id`, `outlet_id`, `id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_invoice_lines_item` FOREIGN KEY (`company_id`, `item_id`) REFERENCES `items` (`company_id`, `id`),
  CONSTRAINT `fk_sales_invoice_lines_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `chk_sales_invoice_lines_qty_positive` CHECK (`qty` > 0),
  CONSTRAINT `chk_sales_invoice_lines_unit_price_non_negative` CHECK (`unit_price` >= 0),
  CONSTRAINT `chk_sales_invoice_lines_line_total_non_negative` CHECK (`line_total` >= 0),
  CONSTRAINT `chk_sales_invoice_lines_line_type` CHECK (`line_type` in ('SERVICE','PRODUCT')),
  CONSTRAINT `chk_sales_invoice_lines_product_item_required` CHECK (`line_type` <> 'PRODUCT' or `item_id` is not null)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_invoice_lines`
--

LOCK TABLES `sales_invoice_lines` WRITE;
/*!40000 ALTER TABLE `sales_invoice_lines` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_invoice_lines` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_invoice_taxes`
--

DROP TABLE IF EXISTS `sales_invoice_taxes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_invoice_taxes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `sales_invoice_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `tax_rate_id` bigint(20) unsigned NOT NULL,
  `amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_invoice_taxes_invoice_rate` (`sales_invoice_id`,`tax_rate_id`),
  KEY `idx_sales_invoice_taxes_company_outlet` (`company_id`,`outlet_id`),
  KEY `idx_sales_invoice_taxes_tax_rate` (`tax_rate_id`),
  CONSTRAINT `fk_sales_invoice_taxes_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_sales_invoice_taxes_invoice` FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_invoice_taxes_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `fk_sales_invoice_taxes_tax_rate` FOREIGN KEY (`tax_rate_id`) REFERENCES `tax_rates` (`id`),
  CONSTRAINT `chk_sales_invoice_taxes_amount_non_negative` CHECK (`amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_invoice_taxes`
--

LOCK TABLES `sales_invoice_taxes` WRITE;
/*!40000 ALTER TABLE `sales_invoice_taxes` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_invoice_taxes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_invoices`
--

DROP TABLE IF EXISTS `sales_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_invoices` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `order_id` bigint(20) unsigned DEFAULT NULL,
  `invoice_no` varchar(64) NOT NULL,
  `invoice_date` date NOT NULL,
  `due_date` date DEFAULT NULL,
  `client_ref` char(36) DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'DRAFT',
  `payment_status` varchar(16) NOT NULL DEFAULT 'UNPAID',
  `subtotal` decimal(18,2) NOT NULL DEFAULT 0.00,
  `tax_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `grand_total` decimal(18,2) NOT NULL DEFAULT 0.00,
  `approved_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `paid_total` decimal(18,2) NOT NULL DEFAULT 0.00,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_invoices_company_invoice_no` (`company_id`,`invoice_no`),
  UNIQUE KEY `uq_sales_invoices_company_client_ref` (`company_id`,`client_ref`),
  KEY `idx_sales_invoices_company_invoice_date` (`company_id`,`invoice_date`),
  KEY `idx_sales_invoices_outlet_invoice_date` (`outlet_id`,`invoice_date`),
  KEY `idx_sales_invoices_company_payment_status` (`company_id`,`payment_status`),
  KEY `idx_sales_invoices_scope_id` (`company_id`,`outlet_id`,`id`),
  KEY `fk_sales_invoices_created_by_user` (`created_by_user_id`),
  KEY `fk_sales_invoices_updated_by_user` (`updated_by_user_id`),
  KEY `idx_sales_invoices_company_date_status` (`company_id`,`invoice_date`,`status`,`outlet_id`),
  KEY `idx_sales_invoices_company_outlet_date` (`company_id`,`outlet_id`,`invoice_date`,`status`),
  KEY `fk_sales_invoices_order_scoped` (`company_id`,`outlet_id`,`order_id`),
  KEY `idx_sales_invoices_approved_by_user_id` (`approved_by_user_id`),
  KEY `idx_sales_inv_ar_ageing` (`company_id`,`status`,`payment_status`,`due_date`,`outlet_id`),
  CONSTRAINT `fk_sales_invoices_approved_by_user` FOREIGN KEY (`approved_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sales_invoices_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_sales_invoices_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sales_invoices_order_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `order_id`) REFERENCES `sales_orders` (`company_id`, `outlet_id`, `id`),
  CONSTRAINT `fk_sales_invoices_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `fk_sales_invoices_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_sales_invoices_payment_status` CHECK (`payment_status` in ('UNPAID','PARTIAL','PAID')),
  CONSTRAINT `chk_sales_invoices_subtotal_non_negative` CHECK (`subtotal` >= 0),
  CONSTRAINT `chk_sales_invoices_tax_amount_non_negative` CHECK (`tax_amount` >= 0),
  CONSTRAINT `chk_sales_invoices_grand_total_non_negative` CHECK (`grand_total` >= 0),
  CONSTRAINT `chk_sales_invoices_paid_total_non_negative` CHECK (`paid_total` >= 0),
  CONSTRAINT `chk_sales_invoices_paid_total_lte_grand_total` CHECK (`paid_total` <= `grand_total`),
  CONSTRAINT `chk_sales_invoices_grand_total_formula` CHECK (`grand_total` = `subtotal` + `tax_amount`),
  CONSTRAINT `chk_sales_invoices_status` CHECK (`status` in ('DRAFT','APPROVED','POSTED','VOID'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_invoices`
--

LOCK TABLES `sales_invoices` WRITE;
/*!40000 ALTER TABLE `sales_invoices` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_invoices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_order_lines`
--

DROP TABLE IF EXISTS `sales_order_lines`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_order_lines` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `order_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `line_no` int(10) unsigned NOT NULL,
  `line_type` varchar(16) NOT NULL DEFAULT 'SERVICE',
  `item_id` bigint(20) unsigned DEFAULT NULL,
  `description` varchar(255) NOT NULL,
  `qty` decimal(18,4) NOT NULL,
  `unit_price` decimal(18,2) NOT NULL,
  `line_total` decimal(18,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_order_lines_order_line_no` (`order_id`,`line_no`),
  KEY `idx_sales_order_lines_company_created_at` (`company_id`,`created_at`),
  KEY `idx_sales_order_lines_outlet_created_at` (`outlet_id`,`created_at`),
  KEY `idx_sales_order_lines_scope_order` (`company_id`,`outlet_id`,`order_id`),
  KEY `idx_sales_order_lines_item_id` (`item_id`),
  KEY `idx_sales_order_lines_company_item` (`company_id`,`item_id`),
  CONSTRAINT `fk_sales_order_lines_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_sales_order_lines_item` FOREIGN KEY (`company_id`, `item_id`) REFERENCES `items` (`company_id`, `id`),
  CONSTRAINT `fk_sales_order_lines_order_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `order_id`) REFERENCES `sales_orders` (`company_id`, `outlet_id`, `id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sales_order_lines_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `chk_sales_order_lines_qty_positive` CHECK (`qty` > 0),
  CONSTRAINT `chk_sales_order_lines_unit_price_non_negative` CHECK (`unit_price` >= 0),
  CONSTRAINT `chk_sales_order_lines_line_total_non_negative` CHECK (`line_total` >= 0),
  CONSTRAINT `chk_sales_order_lines_line_type` CHECK (`line_type` in ('SERVICE','PRODUCT')),
  CONSTRAINT `chk_sales_order_lines_product_item_required` CHECK (`line_type` <> 'PRODUCT' or `item_id` is not null)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_order_lines`
--

LOCK TABLES `sales_order_lines` WRITE;
/*!40000 ALTER TABLE `sales_order_lines` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_order_lines` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_orders`
--

DROP TABLE IF EXISTS `sales_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_orders` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `order_no` varchar(64) NOT NULL,
  `client_ref` char(36) DEFAULT NULL,
  `order_date` date NOT NULL,
  `expected_date` date DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'DRAFT',
  `notes` text DEFAULT NULL,
  `subtotal` decimal(18,2) NOT NULL DEFAULT 0.00,
  `tax_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `grand_total` decimal(18,2) NOT NULL DEFAULT 0.00,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `confirmed_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `confirmed_at` datetime DEFAULT NULL,
  `completed_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_orders_company_order_no` (`company_id`,`order_no`),
  UNIQUE KEY `uq_sales_orders_company_client_ref` (`company_id`,`client_ref`),
  KEY `idx_sales_orders_company_order_date` (`company_id`,`order_date`),
  KEY `idx_sales_orders_outlet_order_date` (`outlet_id`,`order_date`),
  KEY `idx_sales_orders_company_status` (`company_id`,`status`),
  KEY `idx_sales_orders_scope_id` (`company_id`,`outlet_id`,`id`),
  KEY `fk_sales_orders_created_by_user` (`created_by_user_id`),
  KEY `fk_sales_orders_updated_by_user` (`updated_by_user_id`),
  KEY `fk_sales_orders_confirmed_by_user` (`confirmed_by_user_id`),
  KEY `fk_sales_orders_completed_by_user` (`completed_by_user_id`),
  CONSTRAINT `fk_sales_orders_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_sales_orders_completed_by_user` FOREIGN KEY (`completed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sales_orders_confirmed_by_user` FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sales_orders_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sales_orders_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `fk_sales_orders_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_sales_orders_status` CHECK (`status` in ('DRAFT','CONFIRMED','COMPLETED','VOID')),
  CONSTRAINT `chk_sales_orders_subtotal_non_negative` CHECK (`subtotal` >= 0),
  CONSTRAINT `chk_sales_orders_tax_amount_non_negative` CHECK (`tax_amount` >= 0),
  CONSTRAINT `chk_sales_orders_grand_total_non_negative` CHECK (`grand_total` >= 0),
  CONSTRAINT `chk_sales_orders_grand_total_formula` CHECK (`grand_total` = `subtotal` + `tax_amount`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_orders`
--

LOCK TABLES `sales_orders` WRITE;
/*!40000 ALTER TABLE `sales_orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_payment_splits`
--

DROP TABLE IF EXISTS `sales_payment_splits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_payment_splits` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `payment_id` bigint(20) unsigned NOT NULL,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `split_index` int(10) unsigned NOT NULL DEFAULT 0,
  `account_id` bigint(20) unsigned NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_payment_splits_payment_index` (`payment_id`,`split_index`),
  KEY `idx_sales_payment_splits_company_payment` (`company_id`,`payment_id`),
  KEY `idx_sales_payment_splits_outlet_payment` (`outlet_id`,`payment_id`),
  KEY `idx_sales_payment_splits_account` (`account_id`),
  KEY `idx_sales_payment_splits_scope_payment` (`company_id`,`outlet_id`,`payment_id`),
  KEY `fk_sales_payment_splits_account_scoped` (`company_id`,`account_id`),
  CONSTRAINT `fk_sales_payment_splits_account_scoped` FOREIGN KEY (`company_id`, `account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `fk_sales_payment_splits_payment_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `payment_id`) REFERENCES `sales_payments` (`company_id`, `outlet_id`, `id`) ON DELETE CASCADE,
  CONSTRAINT `chk_sales_payment_splits_amount_positive` CHECK (`amount` > 0),
  CONSTRAINT `chk_sales_payment_splits_split_index_range` CHECK (`split_index` between 0 and 9)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_payment_splits`
--

LOCK TABLES `sales_payment_splits` WRITE;
/*!40000 ALTER TABLE `sales_payment_splits` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_payment_splits` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sales_payments`
--

DROP TABLE IF EXISTS `sales_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_payments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `invoice_id` bigint(20) unsigned NOT NULL,
  `account_id` bigint(20) unsigned NOT NULL,
  `payment_no` varchar(64) NOT NULL,
  `client_ref` char(36) DEFAULT NULL,
  `payment_at` datetime NOT NULL,
  `method` varchar(16) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'DRAFT',
  `amount` decimal(18,2) NOT NULL,
  `invoice_amount_idr` decimal(18,2) DEFAULT NULL,
  `payment_amount_idr` decimal(18,2) DEFAULT NULL,
  `payment_delta_idr` decimal(18,2) NOT NULL DEFAULT 0.00,
  `shortfall_settled_as_loss` tinyint(1) NOT NULL DEFAULT 0,
  `shortfall_reason` varchar(500) DEFAULT NULL,
  `shortfall_settled_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `shortfall_settled_at` datetime DEFAULT NULL,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sales_payments_company_payment_no` (`company_id`,`payment_no`),
  UNIQUE KEY `uq_sales_payments_company_client_ref` (`company_id`,`client_ref`),
  KEY `idx_sales_payments_company_payment_at` (`company_id`,`payment_at`),
  KEY `idx_sales_payments_outlet_payment_at` (`outlet_id`,`payment_at`),
  KEY `idx_sales_payments_company_status` (`company_id`,`status`),
  KEY `idx_sales_payments_company_invoice_status` (`company_id`,`invoice_id`,`status`),
  KEY `idx_sales_payments_scope_id` (`company_id`,`outlet_id`,`id`),
  KEY `idx_sales_payments_scope_invoice` (`company_id`,`outlet_id`,`invoice_id`),
  KEY `fk_sales_payments_created_by_user` (`created_by_user_id`),
  KEY `fk_sales_payments_updated_by_user` (`updated_by_user_id`),
  KEY `idx_sales_payments_account` (`account_id`),
  KEY `idx_sales_payments_company_invoice` (`company_id`,`invoice_id`,`payment_at`),
  KEY `idx_sales_payments_company_delta` (`company_id`,`payment_delta_idr`),
  KEY `idx_sales_payments_shortfall` (`company_id`,`shortfall_settled_as_loss`),
  CONSTRAINT `fk_sales_payments_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`),
  CONSTRAINT `fk_sales_payments_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_sales_payments_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sales_payments_invoice_scoped` FOREIGN KEY (`company_id`, `outlet_id`, `invoice_id`) REFERENCES `sales_invoices` (`company_id`, `outlet_id`, `id`),
  CONSTRAINT `fk_sales_payments_outlet_scoped` FOREIGN KEY (`company_id`, `outlet_id`) REFERENCES `outlets` (`company_id`, `id`),
  CONSTRAINT `fk_sales_payments_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_sales_payments_status` CHECK (`status` in ('DRAFT','POSTED','VOID')),
  CONSTRAINT `chk_sales_payments_method` CHECK (`method` in ('CASH','QRIS','CARD')),
  CONSTRAINT `chk_sales_payments_amount_positive` CHECK (`amount` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sales_payments`
--

LOCK TABLES `sales_payments` WRITE;
/*!40000 ALTER TABLE `sales_payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `sales_payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `scheduled_exports`
--

DROP TABLE IF EXISTS `scheduled_exports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `scheduled_exports` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `name` varchar(255) NOT NULL,
  `report_type` enum('SALES','FINANCIAL','INVENTORY','AUDIT','POS_TRANSACTIONS','JOURNAL') NOT NULL,
  `export_format` enum('CSV','XLSX','JSON') NOT NULL DEFAULT 'CSV',
  `schedule_type` enum('DAILY','WEEKLY','MONTHLY','ONCE') NOT NULL,
  `schedule_config` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '{"hour": 0, "dayOfWeek": null, "dayOfMonth": null}' CHECK (json_valid(`schedule_config`)),
  `filters` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '{"dateRange": {start, end}, "outlets": [], "status": []}' CHECK (json_valid(`filters`)),
  `recipients` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT '[{"email": "user@example.com", "type": "TO"}]' CHECK (json_valid(`recipients`)),
  `delivery_method` enum('EMAIL','DOWNLOAD','WEBHOOK') NOT NULL DEFAULT 'EMAIL',
  `webhook_url` varchar(500) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `last_run_at` datetime DEFAULT NULL,
  `next_run_at` datetime NOT NULL,
  `created_by_user_id` bigint(20) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_scheduled_exports_company` (`company_id`),
  KEY `idx_scheduled_exports_next_run` (`next_run_at`,`is_active`),
  KEY `idx_scheduled_exports_active` (`company_id`,`is_active`),
  KEY `created_by_user_id` (`created_by_user_id`),
  CONSTRAINT `scheduled_exports_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `scheduled_exports_ibfk_2` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `scheduled_exports`
--

LOCK TABLES `scheduled_exports` WRITE;
/*!40000 ALTER TABLE `scheduled_exports` DISABLE KEYS */;
/*!40000 ALTER TABLE `scheduled_exports` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `schema_migrations`
--

DROP TABLE IF EXISTS `schema_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `schema_migrations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `version` varchar(255) NOT NULL,
  `applied_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_schema_migrations_version` (`version`)
) ENGINE=InnoDB AUTO_INCREMENT=118 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schema_migrations`
--

LOCK TABLES `schema_migrations` WRITE;
/*!40000 ALTER TABLE `schema_migrations` DISABLE KEYS */;
INSERT INTO `schema_migrations` VALUES
(1,'0001_init.sql','2026-03-16 15:44:11'),
(2,'0002_auth_audit_logs.sql','2026-03-16 15:44:11'),
(3,'0003_master_data_items_prices_sync_pull.sql','2026-03-16 15:44:12'),
(4,'0004_item_prices_company_scoped_foreign_keys.sql','2026-03-16 15:44:12'),
(5,'0005_pos_sync_push_atomic_payload.sql','2026-03-16 15:44:12'),
(6,'0006_journal_batches_doc_unique.sql','2026-03-16 15:44:13'),
(7,'0007_outlet_account_mappings.sql','2026-03-16 15:44:13'),
(8,'0008_journal_lines_integrity_checks.sql','2026-03-16 15:44:13'),
(9,'0009_v_pos_daily_totals.sql','2026-03-16 15:44:13'),
(10,'0010_sales_invoice_payment_in_v1.sql','2026-03-16 15:44:14'),
(11,'0011_outlet_account_mappings_add_card.sql','2026-03-16 15:44:14'),
(12,'0012_accounting_imports_and_balances.sql','2026-03-16 15:44:14'),
(13,'0012_outlet_payment_method_mappings.sql','2026-03-16 15:44:14'),
(14,'0013_data_imports_generic_columns.sql','2026-03-16 15:44:14'),
(15,'0016_add_accounts_is_active.sql','2026-03-16 15:44:14'),
(16,'0017_create_account_types.sql','2026-03-16 15:44:15'),
(17,'0018_add_account_type_category.sql','2026-03-16 15:44:15'),
(18,'0019_extend_audit_logs_for_entities.sql','2026-03-16 15:44:16'),
(19,'0020_master_data_supplies_equipment.sql','2026-03-16 15:44:16'),
(20,'0021_asset_depreciation.sql','2026-03-16 15:44:16'),
(21,'0022_fixed_asset_categories.sql','2026-03-16 15:44:17'),
(22,'0023_expand_depreciation_methods.sql','2026-03-16 15:44:17'),
(23,'0024_outlet_payment_method_labels.sql','2026-03-16 15:44:17'),
(24,'0025_add_accounts_is_payable.sql','2026-03-16 15:44:18'),
(25,'0026_sales_payments_account_id.sql','2026-03-16 15:44:18'),
(26,'0027_outlet_payment_default_flags.sql','2026-03-16 15:44:19'),
(27,'0028_fixed_asset_category_accounts.sql','2026-03-16 15:44:19'),
(28,'0029_auth_refresh_tokens.sql','2026-03-16 15:44:19'),
(29,'0030_auth_oauth_accounts.sql','2026-03-16 15:44:19'),
(30,'0031_auth_login_throttles.sql','2026-03-16 15:44:20'),
(31,'0032_static_pages.sql','2026-03-16 15:44:20'),
(32,'0033_static_pages_terms_seed.sql','2026-03-16 15:44:20'),
(33,'0034_companies_soft_delete.sql','2026-03-16 15:44:20'),
(34,'0035_module_roles.sql','2026-03-16 15:44:20'),
(35,'0036_optimize_indexes_phase1.sql','2026-03-16 15:44:21'),
(36,'0037_optimize_indexes_phase2.sql','2026-03-16 15:44:22'),
(37,'0038_module_roles_permission_mask.sql','2026-03-16 15:44:22'),
(38,'0039_module_roles_drop_legacy_flags.sql','2026-03-16 15:44:22'),
(39,'0040_module_roles_company_scoped.sql','2026-03-16 15:44:23'),
(40,'0041_module_roles_company_scoped_enforce.sql','2026-03-16 15:44:23'),
(41,'0042_company_settings.sql','2026-03-16 15:44:23'),
(42,'0043_tax_rates.sql','2026-03-16 15:44:24'),
(43,'0044_modules_company_modules.sql','2026-03-16 15:44:24'),
(44,'0045_platform_settings.sql','2026-03-16 15:44:24'),
(45,'0046_email_tokens_and_outbox.sql','2026-03-16 15:44:24'),
(46,'0047_password_reset_throttles.sql','2026-03-16 15:44:25'),
(47,'0048_users_email_verified_at.sql','2026-03-16 15:44:25'),
(48,'0049_email_outbox_sending_status.sql','2026-03-16 15:44:25'),
(49,'0050_module_roles_drop_legacy_unique.sql','2026-03-16 15:44:25'),
(50,'0051_item_groups.sql','2026-03-16 15:44:25'),
(51,'0052_item_groups_parent.sql','2026-03-16 15:44:26'),
(52,'0053_fiscal_years.sql','2026-03-16 15:44:26'),
(53,'0054_client_ref_idempotency.sql','2026-03-16 15:44:26'),
(54,'0055_roles_scope_levels.sql','2026-03-16 15:44:26'),
(55,'0056_user_outlet_roles.sql','2026-03-16 15:44:27'),
(56,'0057_audit_logs_success_flag.sql','2026-03-16 15:44:27'),
(57,'0058_pos_transactions_cashier_user_id.sql','2026-03-16 15:44:27'),
(58,'0059_item_prices_company_default.sql','2026-03-16 15:44:28'),
(59,'0060_roles_company_id.sql','2026-03-16 15:44:28'),
(60,'0062_merge_user_roles.sql','2026-03-16 15:44:29'),
(61,'0063_outlet_tables_and_reservations.sql','2026-03-16 15:44:29'),
(62,'0064_pos_transactions_service_context.sql','2026-03-16 15:44:30'),
(63,'0065_scoped_fk_indexes_non_unique.sql','2026-03-16 15:44:30'),
(64,'0066_pos_active_order_sync.sql','2026-03-16 15:44:30'),
(65,'0067_pos_order_flow_and_item_cancellations.sql','2026-03-16 15:44:31'),
(66,'0068_add_pos_module_permissions.sql','2026-03-16 15:44:31'),
(67,'0069_fix_outlet_table_statuses.sql','2026-03-16 15:44:31'),
(68,'0070_numbering_templates.sql','2026-03-16 15:44:31'),
(69,'0071_sales_orders.sql','2026-03-16 15:44:32'),
(70,'0072_invoice_approved_status.sql','2026-03-16 15:44:33'),
(71,'0073_sales_orders_client_ref.sql','2026-03-16 15:44:33'),
(72,'0074_numbering_scope_key.sql','2026-03-16 15:44:33'),
(73,'0075_sales_credit_notes.sql','2026-03-16 15:44:33'),
(74,'0076_sales_invoices_due_date.sql','2026-03-16 15:44:33'),
(75,'0077_sales_lines_item_linkage.sql','2026-03-16 15:44:35'),
(76,'0078_sales_payment_splits.sql','2026-03-16 15:44:35'),
(77,'0079_sales_payment_splits_backfill.sql','2026-03-16 15:44:35'),
(78,'0080_company_account_mappings.sql','2026-03-16 15:44:35'),
(79,'0081_company_payment_method_mappings.sql','2026-03-16 15:44:35'),
(80,'0082_account_mappings_add_invoice_payment_bank.sql','2026-03-16 15:44:36'),
(81,'0083_tax_rates_add_account_id.sql','2026-03-16 15:44:36'),
(82,'0084_remove_sales_tax_mapping_key.sql','2026-03-16 15:44:37'),
(83,'0085_cash_bank_transactions.sql','2026-03-16 15:44:37'),
(84,'0086_sales_payments_add_variance_columns.sql','2026-03-16 15:44:37'),
(85,'0087_company_account_mappings_add_payment_variance_keys.sql','2026-03-16 15:44:37'),
(86,'0088_cash_bank_transactions_hardening.sql','2026-03-16 15:44:37'),
(87,'0089_module_roles_add_cash_bank.sql','2026-03-16 15:44:38'),
(88,'0090_outlet_table_status_reconcile_indexes.sql','2026-03-16 15:44:38'),
(89,'0091_backfill_pos_permissions_seed_parity.sql','2026-03-16 15:44:38'),
(90,'0092_sales_payments_manual_shortfall_loss.sql','2026-03-16 15:44:38'),
(91,'0093_pos_transactions_client_tx_tenant_scope.sql','2026-03-16 15:44:38'),
(92,'0094_fixed_asset_events.sql','2026-03-16 15:44:38'),
(93,'0095_fixed_asset_books.sql','2026-03-16 15:44:38'),
(94,'0096_fixed_asset_disposals.sql','2026-03-16 15:44:39'),
(95,'0097_fixed_asset_disposed_status.sql','2026-03-16 15:44:39'),
(96,'0098_fixed_asset_legacy_event_types.sql','2026-03-16 15:44:39'),
(97,'0099_outlets_profile_fields.sql','2026-03-16 15:44:40'),
(98,'0100_companies_profile_fields.sql','2026-03-16 15:44:41'),
(99,'0101_audit_logs_canonical_success.sql','2026-03-16 15:44:41'),
(100,'0102_users_add_name_column.sql','2026-03-16 15:44:41'),
(101,'0103_company_settings_allow_null_outlet_id.sql','2026-03-16 15:44:42'),
(102,'0104_pos_transactions_add_discount_columns.sql','2026-03-16 15:44:42'),
(103,'0105_audit_logs_add_status_field.sql','2026-03-16 15:44:42'),
(104,'0106_modular_sync_architecture.sql','2026-03-16 15:44:43'),
(105,'0107_modular_sync_triggers.sql','2026-03-16 15:44:44'),
(106,'0107_phase3c_advanced_features.sql','2026-03-16 15:44:44'),
(107,'0108_add_phase3_job_types.sql','2026-03-16 15:44:44'),
(108,'0109_create_inventory_stock_table.sql','2026-03-16 15:44:45'),
(109,'0110_create_inventory_transactions_table.sql','2026-03-16 15:44:45'),
(110,'0111_add_stock_fields_to_products.sql','2026-03-16 15:44:45'),
(111,'0112_fix_sync_version_bigint.sql','2026-03-16 15:44:46'),
(112,'0113_create_sync_audit_events.sql','2026-03-16 15:44:46'),
(113,'0114_add_sync_composite_indexes.sql','2026-03-16 15:44:47'),
(114,'0115_add_company_timezone.sql','2026-03-16 15:44:47'),
(115,'0117_add_company_currency_code.sql','2026-03-16 15:44:47'),
(116,'0118_update_inventory_transaction_types.sql','2026-03-16 15:44:47'),
(117,'0119_fix_fiscal_years_columns.sql','2026-03-16 15:44:47');
/*!40000 ALTER TABLE `schema_migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `static_pages`
--

DROP TABLE IF EXISTS `static_pages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `static_pages` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(128) NOT NULL,
  `title` varchar(191) NOT NULL,
  `content_md` mediumtext NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'DRAFT',
  `published_at` datetime DEFAULT NULL,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `meta_json` longtext DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_static_pages_slug` (`slug`),
  KEY `idx_static_pages_status` (`status`),
  KEY `fk_static_pages_created_by_user` (`created_by_user_id`),
  KEY `fk_static_pages_updated_by_user` (`updated_by_user_id`),
  CONSTRAINT `fk_static_pages_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_static_pages_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_static_pages_status` CHECK (`status` in ('DRAFT','PUBLISHED')),
  CONSTRAINT `chk_static_pages_meta_json` CHECK (`meta_json` is null or json_valid(`meta_json`))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `static_pages`
--

LOCK TABLES `static_pages` WRITE;
/*!40000 ALTER TABLE `static_pages` DISABLE KEYS */;
INSERT INTO `static_pages` VALUES
(1,'privacy','Privacy Policy','# Privacy Policy\n\nEffective date: March 16, 2026\n\nThis Privacy Policy describes how PT Signal Delapan Belas (\"we\", \"our\", \"us\") collects and uses information when you use Jurnapod services (Backoffice, POS, and API).\n\n## Information We Collect\n- Account information: email, role, and access permissions.\n- Business data: items, prices, invoices, payments, and journal entries.\n- POS transaction data and audit logs for operational traceability.\n- Technical data: device information, IP address, and timestamps for security.\n\n## How We Use Information\n- Authenticate users and authorize access.\n- Operate, maintain, and improve the Jurnapod services.\n- Provide customer support and respond to inquiries.\n- Maintain audit trails for compliance and security.\n\n## Sharing of Information\nWe do not sell your personal data. We may share information with trusted service providers (such as hosting and infrastructure vendors) to operate the service. If you use Google SSO, Google provides authentication information to us. We only use it to verify your identity.\n\n## Cookies and Sessions\nWe use HTTP-only cookies for session refresh tokens when enabled. These cookies are used for authentication and security and are not used for advertising.\n\n## Data Retention\nWe retain data as long as needed to provide services and comply with legal and operational requirements. Audit logs may be retained longer for compliance and security.\n\n## Security\nWe implement reasonable technical and organizational measures to protect data against unauthorized access or disclosure. No system is completely secure, so please use strong passwords and keep credentials confidential.\n\n## Your Rights\nYou may request access, correction, or deletion of your personal data, subject to legal and contractual requirements.\n\n## Contact Us\nEmail: [privacy@signal18.id](mailto:privacy@signal18.id)\n\nPT Signal Delapan Belas\nRuko Golden Madrid Blok D No 26 Room 1260\nJl. Letnan Sutopo BSD City\nKota Tangerang Selatan\nBanten\n','PUBLISHED','2026-03-16 15:44:20',NULL,NULL,NULL,'2026-03-16 15:44:20','2026-03-16 15:44:20'),
(2,'terms','Terms of Service','# Terms of Service\n\nEffective date: March 16, 2026\n\nThis is a draft Terms of Service for Jurnapod. Please update this content in Backoffice > Static Pages before publishing.\n','DRAFT',NULL,NULL,NULL,NULL,'2026-03-16 15:44:20','2026-03-16 15:44:20');
/*!40000 ALTER TABLE `static_pages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `supplies`
--

DROP TABLE IF EXISTS `supplies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `supplies` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `sku` varchar(64) DEFAULT NULL,
  `name` varchar(191) NOT NULL,
  `unit` varchar(32) NOT NULL DEFAULT 'unit',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_supplies_company_sku` (`company_id`,`sku`),
  KEY `idx_supplies_company_active` (`company_id`,`is_active`),
  KEY `idx_supplies_company_updated` (`company_id`,`updated_at`),
  CONSTRAINT `fk_supplies_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `supplies`
--

LOCK TABLES `supplies` WRITE;
/*!40000 ALTER TABLE `supplies` DISABLE KEYS */;
/*!40000 ALTER TABLE `supplies` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sync_audit_events`
--

DROP TABLE IF EXISTS `sync_audit_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sync_audit_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `operation_type` varchar(20) NOT NULL,
  `tier_name` varchar(50) NOT NULL,
  `status` varchar(20) NOT NULL,
  `started_at` timestamp NOT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `duration_ms` int(10) unsigned DEFAULT NULL,
  `items_count` int(10) unsigned DEFAULT NULL,
  `version_before` bigint(20) unsigned DEFAULT NULL,
  `version_after` bigint(20) unsigned DEFAULT NULL,
  `error_code` varchar(50) DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `client_device_id` varchar(255) DEFAULT NULL,
  `client_version` varchar(50) DEFAULT NULL,
  `request_size_bytes` int(10) unsigned DEFAULT NULL,
  `response_size_bytes` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`,`created_at`),
  KEY `idx_company_time` (`company_id`,`created_at`),
  KEY `idx_outlet_time` (`outlet_id`,`created_at`),
  KEY `idx_operation` (`operation_type`,`status`),
  KEY `idx_tier` (`tier_name`,`created_at`),
  KEY `idx_status_time` (`status`,`created_at`),
  CONSTRAINT `chk_sync_audit_events_operation_type` CHECK (`operation_type` in ('PUSH','PULL','VERSION_BUMP','HEALTH_CHECK')),
  CONSTRAINT `chk_sync_audit_events_tier_name` CHECK (`tier_name` in ('REALTIME','OPERATIONAL','MASTER','ADMIN','ANALYTICS','default')),
  CONSTRAINT `chk_sync_audit_events_status` CHECK (`status` in ('SUCCESS','FAILED','PARTIAL','IN_PROGRESS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
 PARTITION BY RANGE (year(`created_at`))
(PARTITION `p2024` VALUES LESS THAN (2025) ENGINE = InnoDB,
 PARTITION `p2025` VALUES LESS THAN (2026) ENGINE = InnoDB,
 PARTITION `p2026` VALUES LESS THAN (2027) ENGINE = InnoDB,
 PARTITION `p_future` VALUES LESS THAN MAXVALUE ENGINE = InnoDB);
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sync_audit_events`
--

LOCK TABLES `sync_audit_events` WRITE;
/*!40000 ALTER TABLE `sync_audit_events` DISABLE KEYS */;
/*!40000 ALTER TABLE `sync_audit_events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sync_audit_events_archive`
--

DROP TABLE IF EXISTS `sync_audit_events_archive`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sync_audit_events_archive` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `operation_type` varchar(20) NOT NULL,
  `tier_name` varchar(50) NOT NULL,
  `status` varchar(20) NOT NULL,
  `started_at` timestamp NOT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `duration_ms` int(10) unsigned DEFAULT NULL,
  `items_count` int(10) unsigned DEFAULT NULL,
  `version_before` bigint(20) unsigned DEFAULT NULL,
  `version_after` bigint(20) unsigned DEFAULT NULL,
  `error_code` varchar(50) DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `client_device_id` varchar(255) DEFAULT NULL,
  `client_version` varchar(50) DEFAULT NULL,
  `request_size_bytes` int(10) unsigned DEFAULT NULL,
  `response_size_bytes` int(10) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `archived_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_archive_company_time` (`company_id`,`created_at`),
  KEY `idx_archive_outlet_time` (`outlet_id`,`created_at`),
  KEY `idx_archive_operation` (`operation_type`,`status`),
  KEY `idx_archive_tier` (`tier_name`,`created_at`),
  KEY `idx_archive_status_time` (`status`,`created_at`),
  KEY `idx_archive_archived_at` (`archived_at`),
  CONSTRAINT `chk_archive_sync_audit_events_operation_type` CHECK (`operation_type` in ('PUSH','PULL','VERSION_BUMP','HEALTH_CHECK')),
  CONSTRAINT `chk_archive_sync_audit_events_tier_name` CHECK (`tier_name` in ('REALTIME','OPERATIONAL','MASTER','ADMIN','ANALYTICS','default')),
  CONSTRAINT `chk_archive_sync_audit_events_status` CHECK (`status` in ('SUCCESS','FAILED','PARTIAL','IN_PROGRESS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sync_audit_events_archive`
--

LOCK TABLES `sync_audit_events_archive` WRITE;
/*!40000 ALTER TABLE `sync_audit_events_archive` DISABLE KEYS */;
/*!40000 ALTER TABLE `sync_audit_events_archive` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sync_data_versions`
--

DROP TABLE IF EXISTS `sync_data_versions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sync_data_versions` (
  `company_id` bigint(20) unsigned NOT NULL,
  `current_version` bigint(20) unsigned NOT NULL DEFAULT 0,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`company_id`),
  CONSTRAINT `fk_sync_data_versions_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sync_data_versions`
--

LOCK TABLES `sync_data_versions` WRITE;
/*!40000 ALTER TABLE `sync_data_versions` DISABLE KEYS */;
/*!40000 ALTER TABLE `sync_data_versions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sync_operations`
--

DROP TABLE IF EXISTS `sync_operations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sync_operations` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL COMMENT 'NULL for backoffice operations',
  `sync_module` enum('POS','BACKOFFICE') NOT NULL,
  `tier` enum('REALTIME','OPERATIONAL','MASTER','ADMIN','ANALYTICS') NOT NULL,
  `operation_type` enum('PUSH','PULL','RECONCILE','BATCH') NOT NULL,
  `request_id` varchar(36) NOT NULL COMMENT 'UUID for correlation',
  `started_at` datetime NOT NULL DEFAULT current_timestamp(),
  `completed_at` datetime DEFAULT NULL,
  `status` enum('RUNNING','SUCCESS','FAILED','CANCELLED') NOT NULL DEFAULT 'RUNNING',
  `records_processed` int(10) unsigned DEFAULT NULL,
  `data_version_before` bigint(20) unsigned DEFAULT NULL,
  `data_version_after` bigint(20) unsigned DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `result_summary` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Additional operation metadata' CHECK (json_valid(`result_summary`)),
  `duration_ms` int(10) unsigned GENERATED ALWAYS AS (case when `completed_at` is not null then timestampdiff(MICROSECOND,`started_at`,`completed_at`) / 1000 else NULL end) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_sync_operations_request` (`request_id`),
  KEY `idx_sync_operations_company` (`company_id`),
  KEY `idx_sync_operations_outlet` (`outlet_id`),
  KEY `idx_sync_operations_module_tier` (`sync_module`,`tier`),
  KEY `idx_sync_operations_status` (`status`),
  KEY `idx_sync_operations_started` (`started_at`),
  KEY `idx_sync_operations_duration` (`duration_ms`),
  KEY `idx_sync_operations_completed` (`completed_at`),
  CONSTRAINT `sync_operations_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `sync_operations_ibfk_2` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sync_operations`
--

LOCK TABLES `sync_operations` WRITE;
/*!40000 ALTER TABLE `sync_operations` DISABLE KEYS */;
/*!40000 ALTER TABLE `sync_operations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sync_tier_versions`
--

DROP TABLE IF EXISTS `sync_tier_versions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sync_tier_versions` (
  `company_id` bigint(20) unsigned NOT NULL,
  `tier` enum('REALTIME','OPERATIONAL','MASTER','ADMIN','ANALYTICS') NOT NULL,
  `current_version` bigint(20) unsigned NOT NULL DEFAULT 0,
  `last_updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`company_id`,`tier`),
  KEY `idx_sync_tier_versions_company` (`company_id`),
  KEY `idx_sync_tier_versions_updated` (`last_updated_at`),
  CONSTRAINT `sync_tier_versions_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sync_tier_versions`
--

LOCK TABLES `sync_tier_versions` WRITE;
/*!40000 ALTER TABLE `sync_tier_versions` DISABLE KEYS */;
/*!40000 ALTER TABLE `sync_tier_versions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tax_rates`
--

DROP TABLE IF EXISTS `tax_rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tax_rates` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `code` varchar(64) NOT NULL,
  `name` varchar(191) NOT NULL,
  `rate_percent` decimal(9,4) NOT NULL DEFAULT 0.0000,
  `account_id` bigint(20) unsigned DEFAULT NULL,
  `is_inclusive` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `updated_by_user_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tax_rates_company_code` (`company_id`,`code`),
  KEY `idx_tax_rates_company_active` (`company_id`,`is_active`),
  KEY `fk_tax_rates_created_by_user` (`created_by_user_id`),
  KEY `fk_tax_rates_updated_by_user` (`updated_by_user_id`),
  KEY `idx_tax_rates_company_account` (`company_id`,`account_id`),
  CONSTRAINT `fk_tax_rates_account` FOREIGN KEY (`company_id`, `account_id`) REFERENCES `accounts` (`company_id`, `id`),
  CONSTRAINT `fk_tax_rates_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  CONSTRAINT `fk_tax_rates_created_by_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tax_rates_updated_by_user` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_tax_rates_rate_percent` CHECK (`rate_percent` >= 0 and `rate_percent` <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tax_rates`
--

LOCK TABLES `tax_rates` WRITE;
/*!40000 ALTER TABLE `tax_rates` DISABLE KEYS */;
/*!40000 ALTER TABLE `tax_rates` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_tax_rates_ai_bump_sync_version
AFTER INSERT ON tax_rates
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'MASTER,OPERATIONAL') */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_tax_rates_au_bump_sync_version
AFTER UPDATE ON tax_rates
FOR EACH ROW
    CALL BumpSyncTiers(NEW.company_id, 'MASTER,OPERATIONAL') */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,STRICT_TRANS_TABLES,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER trg_tax_rates_ad_bump_sync_version
AFTER DELETE ON tax_rates
FOR EACH ROW
    CALL BumpSyncTiers(OLD.company_id, 'MASTER,OPERATIONAL') */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Table structure for table `user_outlets`
--

DROP TABLE IF EXISTS `user_outlets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_outlets` (
  `user_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`,`outlet_id`),
  KEY `fk_user_outlets_outlet` (`outlet_id`),
  CONSTRAINT `fk_user_outlets_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_outlets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_outlets`
--

LOCK TABLES `user_outlets` WRITE;
/*!40000 ALTER TABLE `user_outlets` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_outlets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_role_assignments`
--

DROP TABLE IF EXISTS `user_role_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `user_role_assignments` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) unsigned NOT NULL,
  `role_id` bigint(20) unsigned NOT NULL,
  `outlet_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_role_outlet` (`user_id`,`outlet_id`,`role_id`),
  KEY `idx_user_role_assignments_user` (`user_id`),
  KEY `idx_user_role_assignments_outlet` (`outlet_id`),
  KEY `idx_user_role_assignments_role` (`role_id`),
  CONSTRAINT `fk_user_role_assignments_outlet` FOREIGN KEY (`outlet_id`) REFERENCES `outlets` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_role_assignments_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_role_assignments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='User role assignments: outlet_id=NULL for global roles, outlet_id=N for outlet-scoped roles';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_role_assignments`
--

LOCK TABLES `user_role_assignments` WRITE;
/*!40000 ALTER TABLE `user_role_assignments` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_role_assignments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `company_id` bigint(20) unsigned NOT NULL,
  `name` varchar(191) DEFAULT NULL,
  `email` varchar(191) NOT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_company_email` (`company_id`,`email`),
  KEY `idx_users_email_verified_at` (`email_verified_at`),
  CONSTRAINT `fk_users_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary table structure for view `v_pos_daily_totals`
--

DROP TABLE IF EXISTS `v_pos_daily_totals`;
/*!50001 DROP VIEW IF EXISTS `v_pos_daily_totals`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8;
/*!50001 CREATE VIEW `v_pos_daily_totals` AS SELECT
 1 AS `company_id`,
  1 AS `outlet_id`,
  1 AS `trx_date`,
  1 AS `status`,
  1 AS `tx_count`,
  1 AS `gross_total`,
  1 AS `paid_total` */;
SET character_set_client = @saved_cs_client;

--
-- Final view structure for view `v_pos_daily_totals`
--

/*!50001 DROP VIEW IF EXISTS `v_pos_daily_totals`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_unicode_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_pos_daily_totals` AS select `pt`.`company_id` AS `company_id`,`pt`.`outlet_id` AS `outlet_id`,cast(`pt`.`trx_at` as date) AS `trx_date`,`pt`.`status` AS `status`,count(0) AS `tx_count`,coalesce(sum(`i`.`gross_total`),0) AS `gross_total`,coalesce(sum(`p`.`paid_total`),0) AS `paid_total` from ((`pos_transactions` `pt` left join (select `pos_transaction_items`.`pos_transaction_id` AS `pos_transaction_id`,sum(`pos_transaction_items`.`qty` * `pos_transaction_items`.`price_snapshot`) AS `gross_total` from `pos_transaction_items` group by `pos_transaction_items`.`pos_transaction_id`) `i` on(`i`.`pos_transaction_id` = `pt`.`id`)) left join (select `pos_transaction_payments`.`pos_transaction_id` AS `pos_transaction_id`,sum(`pos_transaction_payments`.`amount`) AS `paid_total` from `pos_transaction_payments` group by `pos_transaction_payments`.`pos_transaction_id`) `p` on(`p`.`pos_transaction_id` = `pt`.`id`)) group by `pt`.`company_id`,`pt`.`outlet_id`,cast(`pt`.`trx_at` as date),`pt`.`status` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2026-03-16 22:47:30
