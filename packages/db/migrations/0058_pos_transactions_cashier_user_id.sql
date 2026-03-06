-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

ALTER TABLE pos_transactions
  ADD COLUMN cashier_user_id BIGINT UNSIGNED NULL AFTER outlet_id,
  ADD INDEX idx_pos_transactions_company_outlet_cashier_trx (company_id, outlet_id, cashier_user_id, trx_at, id),
  ADD CONSTRAINT fk_pos_transactions_cashier_user
    FOREIGN KEY (cashier_user_id) REFERENCES users(id) ON DELETE SET NULL;
