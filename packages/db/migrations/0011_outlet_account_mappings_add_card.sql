-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = 'outlet_account_mappings'
      AND constraint_name = 'chk_outlet_account_mappings_mapping_key'
  ),
  'ALTER TABLE outlet_account_mappings DROP CONSTRAINT chk_outlet_account_mappings_mapping_key',
  'SELECT 1'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE outlet_account_mappings
  ADD CONSTRAINT chk_outlet_account_mappings_mapping_key
  CHECK (mapping_key IN ('CASH', 'QRIS', 'CARD', 'SALES_REVENUE', 'SALES_TAX', 'AR'));
