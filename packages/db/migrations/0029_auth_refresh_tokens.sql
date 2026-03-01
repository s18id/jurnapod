-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Create refresh token store for session rotation

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME DEFAULT NULL,
  rotated_from_id BIGINT UNSIGNED DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  user_agent VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_refresh_tokens_hash (token_hash),
  KEY idx_auth_refresh_tokens_user_expires (user_id, expires_at),
  KEY idx_auth_refresh_tokens_company_expires (company_id, expires_at),
  KEY idx_auth_refresh_tokens_rotated_from (rotated_from_id),
  CONSTRAINT fk_auth_refresh_tokens_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_auth_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_auth_refresh_tokens_rotated_from FOREIGN KEY (rotated_from_id)
    REFERENCES auth_refresh_tokens(id) ON DELETE SET NULL
) ENGINE=InnoDB;
