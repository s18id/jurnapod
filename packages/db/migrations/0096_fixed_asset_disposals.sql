-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Fixed Asset Lifecycle: Disposal Details Table
-- Stores disposal-specific data (proceeds, cost removed, gain/loss calculation)

SET @table_exists := (
  SELECT COUNT(*) > 0
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_disposals'
);

SET @create_table_sql := IF(
  @table_exists = 0,
  'CREATE TABLE fixed_asset_disposals (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id BIGINT UNSIGNED NOT NULL,
    event_id BIGINT UNSIGNED NOT NULL,
    asset_id BIGINT UNSIGNED NOT NULL,
    proceeds DECIMAL(18,2) NOT NULL DEFAULT 0,
    cost_removed DECIMAL(18,2) NOT NULL DEFAULT 0,
    depr_removed DECIMAL(18,2) NOT NULL DEFAULT 0,
    impairment_removed DECIMAL(18,2) NOT NULL DEFAULT 0,
    disposal_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
    gain_loss DECIMAL(18,2) NOT NULL,
    disposal_type VARCHAR(16) NOT NULL,
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_fixed_asset_disposals_event (event_id),
    KEY idx_fixed_asset_disposals_asset (asset_id),
    CONSTRAINT fk_fixed_asset_disposals_company FOREIGN KEY (company_id) REFERENCES companies(id),
    CONSTRAINT fk_fixed_asset_disposals_event FOREIGN KEY (event_id) REFERENCES fixed_asset_events(id),
    CONSTRAINT fk_fixed_asset_disposals_asset FOREIGN KEY (asset_id) REFERENCES fixed_assets(id),
    CONSTRAINT chk_fixed_asset_disposals_type CHECK (disposal_type IN (''SALE'', ''SCRAP''))
  ) ENGINE=InnoDB',
  'SELECT ''Table already exists'''
);

PREPARE create_table_stmt FROM @create_table_sql;
EXECUTE create_table_stmt;
DEALLOCATE PREPARE create_table_stmt;
