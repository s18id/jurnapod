-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Email tokens for password reset, user invite, email verification
CREATE TABLE IF NOT EXISTS email_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  email VARCHAR(191) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  type ENUM('PASSWORD_RESET', 'INVITE', 'VERIFY_EMAIL') NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by BIGINT UNSIGNED NULL,
  UNIQUE KEY unique_token_hash (token_hash),
  KEY idx_email_tokens_user_id (user_id),
  KEY idx_email_tokens_company_id (company_id),
  KEY idx_email_tokens_expires_at (expires_at),
  KEY idx_email_tokens_type (type),
  FOREIGN KEY fk_email_tokens_company_id (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY fk_email_tokens_user_id (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY fk_email_tokens_created_by (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Email outbox for queued emails with retry support
CREATE TABLE IF NOT EXISTS email_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  to_email VARCHAR(191) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  status ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
  error_message TEXT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP NULL,
  KEY idx_email_outbox_status_next_retry (status, next_retry_at),
  KEY idx_email_outbox_company_id (company_id),
  KEY idx_email_outbox_created_at (created_at),
  FOREIGN KEY fk_email_outbox_company_id (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY fk_email_outbox_user_id (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
