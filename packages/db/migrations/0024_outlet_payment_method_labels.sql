ALTER TABLE outlet_payment_method_mappings
  ADD COLUMN IF NOT EXISTS label VARCHAR(191) NULL AFTER method_code;
