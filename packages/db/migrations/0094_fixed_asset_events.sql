-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Fixed Asset Lifecycle: Event Log Table
-- Records all lifecycle events (acquisition, depreciation, transfer, impairment, disposal, void)

SET @table_exists := (
  SELECT COUNT(*) > 0
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_events'
);

SET @create_table_sql := IF(
  @table_exists = 0,
  'CREATE TABLE fixed_asset_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id BIGINT UNSIGNED NOT NULL,
    asset_id BIGINT UNSIGNED NOT NULL,
    event_type VARCHAR(32) NOT NULL,
    event_date DATE NOT NULL,
    outlet_id BIGINT UNSIGNED DEFAULT NULL,
    journal_batch_id BIGINT UNSIGNED DEFAULT NULL,
    status VARCHAR(16) NOT NULL DEFAULT ''POSTED'',
    idempotency_key VARCHAR(64) NOT NULL,
    event_data JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT UNSIGNED NOT NULL,
    voided_by BIGINT UNSIGNED DEFAULT NULL,
    voided_at DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_fixed_asset_events_company_key (company_id, idempotency_key),
    KEY idx_fixed_asset_events_asset (asset_id),
    KEY idx_fixed_asset_events_company_date (company_id, event_date),
    KEY idx_fixed_asset_events_journal (journal_batch_id),
    CONSTRAINT fk_fixed_asset_events_company FOREIGN KEY (company_id) REFERENCES companies(id),
    CONSTRAINT fk_fixed_asset_events_asset FOREIGN KEY (asset_id) REFERENCES fixed_assets(id),
    CONSTRAINT fk_fixed_asset_events_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id),
    CONSTRAINT fk_fixed_asset_events_journal FOREIGN KEY (journal_batch_id) REFERENCES journal_batches(id),
    CONSTRAINT fk_fixed_asset_events_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_fixed_asset_events_type CHECK (event_type IN (''ACQUISITION'', ''DEPRECIATION'', ''TRANSFER'', ''IMPAIRMENT'', ''DISPOSAL'', ''VOID'')),
    CONSTRAINT chk_fixed_asset_events_status CHECK (status IN (''POSTED'', ''VOIDED''))
  ) ENGINE=InnoDB',
  'SELECT ''Table already exists'''
);

PREPARE create_table_stmt FROM @create_table_sql;
EXECUTE create_table_stmt;
DEALLOCATE PREPARE create_table_stmt;

SET @journal_batch_fk_exists := (
  SELECT COUNT(*) > 0
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fixed_asset_events'
    AND CONSTRAINT_NAME = 'fk_fixed_asset_events_journal'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @add_journal_fk_sql := IF(
  @journal_batch_fk_exists = 0,
  'ALTER TABLE fixed_asset_events ADD CONSTRAINT fk_fixed_asset_events_journal FOREIGN KEY (journal_batch_id) REFERENCES journal_batches(id)',
  'SELECT ''FK already exists'''
);

PREPARE add_journal_fk_stmt FROM @add_journal_fk_sql;
EXECUTE add_journal_fk_stmt;
DEALLOCATE PREPARE add_journal_fk_stmt;
