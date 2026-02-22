SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'outlets'
    GROUP BY index_name
    HAVING SUM(seq_in_index = 1 AND column_name = 'company_id') = 1
      AND SUM(seq_in_index = 2 AND column_name = 'id') = 1
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE outlets ADD KEY idx_outlets_company_id_id (company_id, id)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'accounts'
    GROUP BY index_name
    HAVING SUM(seq_in_index = 1 AND column_name = 'company_id') = 1
      AND SUM(seq_in_index = 2 AND column_name = 'id') = 1
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE accounts ADD KEY idx_accounts_company_id_id (company_id, id)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS outlet_account_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  mapping_key VARCHAR(64) NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_outlet_account_mappings_scope_key (company_id, outlet_id, mapping_key),
  KEY idx_outlet_account_mappings_scope_account (company_id, outlet_id, account_id),
  CONSTRAINT chk_outlet_account_mappings_mapping_key CHECK (mapping_key IN ('CASH', 'QRIS', 'SALES_REVENUE', 'SALES_TAX', 'AR')),
  CONSTRAINT fk_outlet_account_mappings_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_outlet_account_mappings_outlet_scoped FOREIGN KEY (company_id, outlet_id) REFERENCES outlets(company_id, id),
  CONSTRAINT fk_outlet_account_mappings_account_scoped FOREIGN KEY (company_id, account_id) REFERENCES accounts(company_id, id)
) ENGINE=InnoDB;
