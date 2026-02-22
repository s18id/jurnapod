ALTER TABLE pos_transactions
  ADD COLUMN IF NOT EXISTS payload_sha256 CHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payload_hash_version TINYINT UNSIGNED NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS pos_transaction_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pos_transaction_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  line_no INT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  qty DECIMAL(18,4) NOT NULL,
  price_snapshot DECIMAL(18,2) NOT NULL,
  name_snapshot VARCHAR(191) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pos_transaction_items_tx_line (pos_transaction_id, line_no),
  KEY idx_pos_transaction_items_company_created_at (company_id, created_at),
  KEY idx_pos_transaction_items_outlet_created_at (outlet_id, created_at),
  CONSTRAINT fk_pos_transaction_items_tx FOREIGN KEY (pos_transaction_id) REFERENCES pos_transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_transaction_items_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_pos_transaction_items_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pos_transaction_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pos_transaction_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  payment_no INT UNSIGNED NOT NULL,
  method VARCHAR(64) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pos_transaction_payments_tx_payment (pos_transaction_id, payment_no),
  KEY idx_pos_transaction_payments_company_created_at (company_id, created_at),
  KEY idx_pos_transaction_payments_outlet_created_at (outlet_id, created_at),
  CONSTRAINT fk_pos_transaction_payments_tx FOREIGN KEY (pos_transaction_id) REFERENCES pos_transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_transaction_payments_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_pos_transaction_payments_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
) ENGINE=InnoDB;
