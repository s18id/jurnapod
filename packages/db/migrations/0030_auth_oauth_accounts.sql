-- Create OAuth account linkage table

CREATE TABLE IF NOT EXISTS auth_oauth_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(191) NOT NULL,
  email_snapshot VARCHAR(191) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_oauth_accounts_provider_user (provider, provider_user_id, company_id),
  KEY idx_auth_oauth_accounts_user (user_id),
  KEY idx_auth_oauth_accounts_company (company_id),
  CONSTRAINT fk_auth_oauth_accounts_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_auth_oauth_accounts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
