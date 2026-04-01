-- Migration: 0131_auth_throttles_merge.sql
-- Story 20.5: Auth Throttle Merge
-- Merge auth_login_throttles and auth_password_reset_throttles into unified auth_throttles table
-- Compatible with: MySQL 8.0+, MariaDB 10.2+
-- Idempotent: safe to rerun

-- ============================================================================
-- Step 1: Create unified auth_throttles table
-- ============================================================================
CREATE TABLE IF NOT EXISTS `auth_throttles` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `key_hash` VARCHAR(255) NOT NULL COMMENT 'Hashed identifier (email, IP, etc)',
    `throttle_type` ENUM('login', 'password_reset') NOT NULL,
    `failure_count` INT UNSIGNED DEFAULT 0,
    `request_count` INT UNSIGNED DEFAULT 0,
    `last_failed_at` DATETIME NULL,
    `last_succeeded_at` DATETIME NULL,
    `last_ip` VARCHAR(45) NULL,
    `last_user_agent` TEXT NULL,
    `locked_until` DATETIME NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_key_type` (`key_hash`, `throttle_type`),
    INDEX `idx_throttle_type` (`throttle_type`),
    INDEX `idx_locked_until` (`locked_until`),
    INDEX `idx_last_failed` (`last_failed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Step 2: Migrate login throttle data (type='login')
-- Only migrate if source table exists and target is empty for this type
-- ============================================================================
SET @src_exists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'auth_login_throttles'
);
SET @dst_exists = (
  SELECT COUNT(*) FROM auth_throttles WHERE throttle_type = 'login'
);

IF @src_exists = 1 AND @dst_exists = 0 THEN
  INSERT INTO auth_throttles (`key_hash`, `throttle_type`, `failure_count`, `request_count`, `last_failed_at`, `last_ip`, `last_user_agent`, `created_at`, `updated_at`)
  SELECT
    `key_hash`,
    'login' AS `throttle_type`,
    COALESCE(`failure_count`, 0) AS `failure_count`,
    0 AS `request_count`,
    `last_failed_at`,
    `last_ip`,
    `last_user_agent`,
    `created_at`,
    `updated_at`
  FROM auth_login_throttles
  ON DUPLICATE KEY UPDATE
    `failure_count` = VALUES(`failure_count`);
END IF;

-- ============================================================================
-- Step 3: Migrate password reset throttle data (type='password_reset')
-- Only migrate if source table exists and target is empty for this type
-- ============================================================================
SET @src_exists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'auth_password_reset_throttles'
);
SET @dst_exists = (
  SELECT COUNT(*) FROM auth_throttles WHERE throttle_type = 'password_reset'
);

IF @src_exists = 1 AND @dst_exists = 0 THEN
  INSERT INTO auth_throttles (`key_hash`, `throttle_type`, `failure_count`, `request_count`, `last_failed_at`, `last_ip`, `last_user_agent`, `created_at`, `updated_at`)
  SELECT
    `key_hash`,
    'password_reset' AS `throttle_type`,
    0 AS `failure_count`,
    COALESCE(`request_count`, 0) AS `request_count`,
    `window_started_at` AS `last_failed_at`,
    `last_ip`,
    `last_user_agent`,
    `created_at`,
    `updated_at`
  FROM auth_password_reset_throttles
  ON DUPLICATE KEY UPDATE
    `request_count` = VALUES(`request_count`);
END IF;

-- ============================================================================
-- Step 4: Drop old tables (only after verification is complete)
-- Uncomment these AFTER verifying data migration and application code updates
-- ============================================================================
-- DROP TABLE IF EXISTS `auth_login_throttles`;
-- DROP TABLE IF EXISTS `auth_password_reset_throttles`;
