-- Create login throttling counters

CREATE TABLE IF NOT EXISTS auth_login_throttles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  key_hash CHAR(64) NOT NULL,
  failure_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_failed_at DATETIME DEFAULT NULL,
  last_ip VARCHAR(45) DEFAULT NULL,
  last_user_agent VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_login_throttles_key (key_hash),
  KEY idx_auth_login_throttles_last_failed (last_failed_at)
) ENGINE=InnoDB;
