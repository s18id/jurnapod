-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

CREATE TABLE IF NOT EXISTS item_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(64) DEFAULT NULL,
  name VARCHAR(191) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_item_groups_company_code (company_id, code),
  KEY idx_item_groups_company_active (company_id, is_active),
  KEY idx_item_groups_company_updated (company_id, updated_at),
  CONSTRAINT fk_item_groups_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

ALTER TABLE items
  ADD COLUMN item_group_id BIGINT UNSIGNED DEFAULT NULL AFTER item_type,
  ADD KEY idx_items_company_group (company_id, item_group_id),
  ADD CONSTRAINT fk_items_group FOREIGN KEY (item_group_id) REFERENCES item_groups(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS trg_item_groups_ai_bump_sync_version;
CREATE TRIGGER trg_item_groups_ai_bump_sync_version
AFTER INSERT ON item_groups
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_item_groups_au_bump_sync_version;
CREATE TRIGGER trg_item_groups_au_bump_sync_version
AFTER UPDATE ON item_groups
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (NEW.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS trg_item_groups_ad_bump_sync_version;
CREATE TRIGGER trg_item_groups_ad_bump_sync_version
AFTER DELETE ON item_groups
FOR EACH ROW
  INSERT INTO sync_data_versions (company_id, current_version)
  VALUES (OLD.company_id, 1)
  ON DUPLICATE KEY UPDATE
    current_version = current_version + 1,
    updated_at = CURRENT_TIMESTAMP;
