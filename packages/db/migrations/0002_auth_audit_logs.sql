-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED DEFAULT NULL,
  outlet_id BIGINT UNSIGNED DEFAULT NULL,
  user_id BIGINT UNSIGNED DEFAULT NULL,
  action VARCHAR(64) NOT NULL,
  result VARCHAR(16) NOT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  payload_json LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_company_created_at (company_id, created_at),
  KEY idx_audit_logs_user_created_at (user_id, created_at),
  KEY idx_audit_logs_action_created_at (action, created_at),
  CONSTRAINT chk_audit_logs_result CHECK (result IN ('SUCCESS', 'FAIL')),
  CONSTRAINT chk_audit_logs_payload_json CHECK (JSON_VALID(payload_json)),
  CONSTRAINT fk_audit_logs_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_logs_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
