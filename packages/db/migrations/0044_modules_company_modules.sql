-- Migration: Modules catalog + company modules

CREATE TABLE IF NOT EXISTS modules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_modules_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS company_modules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  module_id BIGINT UNSIGNED NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  config_json LONGTEXT NOT NULL,
  created_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  updated_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_modules_company_module (company_id, module_id),
  KEY idx_company_modules_company (company_id),
  KEY idx_company_modules_module (module_id),
  CONSTRAINT chk_company_modules_config_json CHECK (JSON_VALID(config_json)),
  CONSTRAINT fk_company_modules_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_company_modules_module FOREIGN KEY (module_id) REFERENCES modules(id),
  CONSTRAINT fk_company_modules_created_by_user FOREIGN KEY (created_by_user_id)
    REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_company_modules_updated_by_user FOREIGN KEY (updated_by_user_id)
    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

DROP TRIGGER IF EXISTS trg_company_modules_ai_bump_sync_version;
CREATE TRIGGER trg_company_modules_ai_bump_sync_version
AFTER INSERT ON company_modules
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_company_modules_au_bump_sync_version;
CREATE TRIGGER trg_company_modules_au_bump_sync_version
AFTER UPDATE ON company_modules
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_company_modules_ad_bump_sync_version;
CREATE TRIGGER trg_company_modules_ad_bump_sync_version
AFTER DELETE ON company_modules
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (OLD.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;
