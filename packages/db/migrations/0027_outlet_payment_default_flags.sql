-- Add default flag to outlet_payment_method_mappings
-- is_invoice_default: indicates the default payment method for backoffice invoice payments

ALTER TABLE outlet_payment_method_mappings
  ADD COLUMN is_invoice_default TINYINT(1) NOT NULL DEFAULT 0 AFTER account_id;

-- Add index to efficiently query default payment method
CREATE INDEX idx_outlet_payment_invoice_default ON outlet_payment_method_mappings(company_id, outlet_id, is_invoice_default);

-- Note: Uniqueness constraint (only one default per outlet) will be enforced at application level
-- to avoid complex DB triggers and allow for flexible validation messages
