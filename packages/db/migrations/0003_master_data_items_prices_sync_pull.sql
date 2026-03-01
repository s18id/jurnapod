-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

CREATE TABLE IF NOT EXISTS items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  sku VARCHAR(64) DEFAULT NULL,
  name VARCHAR(191) NOT NULL,
  item_type VARCHAR(16) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_items_company_sku (company_id, sku),
  KEY idx_items_company_active (company_id, is_active),
  KEY idx_items_company_updated (company_id, updated_at),
  CONSTRAINT chk_items_type CHECK (item_type IN ('SERVICE', 'PRODUCT', 'INGREDIENT', 'RECIPE')),
  CONSTRAINT fk_items_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS item_prices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  price DECIMAL(18,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_item_prices_company_outlet_item (company_id, outlet_id, item_id),
  KEY idx_item_prices_company_outlet_active (company_id, outlet_id, is_active),
  KEY idx_item_prices_company_updated (company_id, updated_at),
  CONSTRAINT chk_item_prices_price_non_negative CHECK (price >= 0),
  CONSTRAINT fk_item_prices_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_item_prices_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id),
  CONSTRAINT fk_item_prices_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sync_data_versions (
  company_id BIGINT UNSIGNED NOT NULL,
  current_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id),
  CONSTRAINT fk_sync_data_versions_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO sync_data_versions (company_id, current_version)
SELECT c.id, 0
FROM companies c
ON DUPLICATE KEY UPDATE company_id = company_id;

DROP TRIGGER IF EXISTS trg_items_ai_bump_sync_version;
CREATE TRIGGER trg_items_ai_bump_sync_version
AFTER INSERT ON items
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_items_au_bump_sync_version;
CREATE TRIGGER trg_items_au_bump_sync_version
AFTER UPDATE ON items
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_items_ad_bump_sync_version;
CREATE TRIGGER trg_items_ad_bump_sync_version
AFTER DELETE ON items
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (OLD.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_item_prices_ai_bump_sync_version;
CREATE TRIGGER trg_item_prices_ai_bump_sync_version
AFTER INSERT ON item_prices
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_item_prices_au_bump_sync_version;
CREATE TRIGGER trg_item_prices_au_bump_sync_version
AFTER UPDATE ON item_prices
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_item_prices_ad_bump_sync_version;
CREATE TRIGGER trg_item_prices_ad_bump_sync_version
AFTER DELETE ON item_prices
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (OLD.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_feature_flags_ai_bump_sync_version;
CREATE TRIGGER trg_feature_flags_ai_bump_sync_version
AFTER INSERT ON feature_flags
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_feature_flags_au_bump_sync_version;
CREATE TRIGGER trg_feature_flags_au_bump_sync_version
AFTER UPDATE ON feature_flags
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_feature_flags_ad_bump_sync_version;
CREATE TRIGGER trg_feature_flags_ad_bump_sync_version
AFTER DELETE ON feature_flags
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (OLD.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;
