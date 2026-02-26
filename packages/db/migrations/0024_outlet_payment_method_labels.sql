SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'outlet_payment_method_mappings'
      AND column_name = 'label'
  ),
  'SELECT 1',
  'ALTER TABLE outlet_payment_method_mappings ADD COLUMN label VARCHAR(191) NULL AFTER method_code'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
