CREATE TABLE IF NOT EXISTS outlet_payment_method_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  method_code VARCHAR(64) NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_outlet_payment_method_scope (company_id, outlet_id, method_code),
  KEY idx_outlet_payment_method_account (company_id, outlet_id, account_id),
  CONSTRAINT fk_outlet_payment_method_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_outlet_payment_method_outlet FOREIGN KEY (company_id, outlet_id) REFERENCES outlets(company_id, id),
  CONSTRAINT fk_outlet_payment_method_account FOREIGN KEY (company_id, account_id) REFERENCES accounts(company_id, id)
) ENGINE=InnoDB;
