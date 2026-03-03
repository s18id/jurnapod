-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Create password reset throttling counters
-- Prevents abuse of password reset endpoint by limiting requests per email+IP and per IP

CREATE TABLE IF NOT EXISTS auth_password_reset_throttles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  key_hash CHAR(64) NOT NULL,
  request_count INT UNSIGNED NOT NULL DEFAULT 0,
  window_started_at DATETIME NOT NULL,
  last_ip VARCHAR(45) DEFAULT NULL,
  last_user_agent VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_password_reset_throttles_key (key_hash),
  KEY idx_auth_password_reset_throttles_window (window_started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
