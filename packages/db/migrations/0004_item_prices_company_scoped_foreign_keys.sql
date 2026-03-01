-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

SET @item_company_mismatch_count = (
  SELECT COUNT(*)
  FROM item_prices ip
  INNER JOIN items i ON i.id = ip.item_id
  WHERE ip.company_id <> i.company_id
);

SET @outlet_company_mismatch_count = (
  SELECT COUNT(*)
  FROM item_prices ip
  INNER JOIN outlets o ON o.id = ip.outlet_id
  WHERE ip.company_id <> o.company_id
);

SET @missing_item_parent_count = (
  SELECT COUNT(*)
  FROM item_prices ip
  LEFT JOIN items i ON i.id = ip.item_id
  WHERE i.id IS NULL
);

SET @missing_outlet_parent_count = (
  SELECT COUNT(*)
  FROM item_prices ip
  LEFT JOIN outlets o ON o.id = ip.outlet_id
  WHERE o.id IS NULL
);

SET @preflight_error_message = IF(
  @item_company_mismatch_count > 0
  OR @outlet_company_mismatch_count > 0
  OR @missing_item_parent_count > 0
  OR @missing_outlet_parent_count > 0,
  CONCAT(
    'preflight 0004 failed: invalid item_prices refs found (cross_company_item=',
    @item_company_mismatch_count,
    ', cross_company_outlet=',
    @outlet_company_mismatch_count,
    ', missing_item=',
    @missing_item_parent_count,
    ', missing_outlet=',
    @missing_outlet_parent_count,
    '). fix data (orphans/cross-company), rerun db:migrate'
  ),
  NULL
);

SET @stmt = IF(
  @preflight_error_message IS NULL,
  'SELECT 1',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = @preflight_error_message'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'items'
    GROUP BY index_name
    HAVING SUM(seq_in_index = 1 AND column_name = 'company_id') = 1
      AND SUM(seq_in_index = 2 AND column_name = 'id') = 1
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE items ADD KEY idx_items_company_id_id (company_id, id)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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
      AND table_name = 'item_prices'
    GROUP BY index_name
    HAVING SUM(seq_in_index = 1 AND column_name = 'company_id') = 1
      AND SUM(seq_in_index = 2 AND column_name = 'item_id') = 1
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE item_prices ADD KEY idx_item_prices_company_item (company_id, item_id)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.referential_constraints
    WHERE constraint_schema = DATABASE()
      AND table_name = 'item_prices'
      AND constraint_name = 'fk_item_prices_company_outlet_scoped'
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE item_prices ADD CONSTRAINT fk_item_prices_company_outlet_scoped FOREIGN KEY (company_id, outlet_id) REFERENCES outlets(company_id, id)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.referential_constraints
    WHERE constraint_schema = DATABASE()
      AND table_name = 'item_prices'
      AND constraint_name = 'fk_item_prices_company_item_scoped'
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE item_prices ADD CONSTRAINT fk_item_prices_company_item_scoped FOREIGN KEY (company_id, item_id) REFERENCES items(company_id, id) ON DELETE CASCADE'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @legacy_fk_drop_sql = (
  SELECT GROUP_CONCAT(
    CONCAT(
      'DROP FOREIGN KEY `',
      REPLACE(legacy.constraint_name, '`', '``'),
      '`'
    )
    ORDER BY legacy.constraint_name
    SEPARATOR ', '
  )
  FROM (
    SELECT kcu.constraint_name
    FROM information_schema.key_column_usage kcu
    WHERE kcu.constraint_schema = DATABASE()
      AND kcu.table_name = 'item_prices'
    GROUP BY kcu.constraint_name
    HAVING COUNT(*) = 1
      AND SUM(
        kcu.column_name = 'outlet_id'
        AND kcu.referenced_table_name = 'outlets'
        AND kcu.referenced_column_name = 'id'
      ) = 1

    UNION

    SELECT kcu.constraint_name
    FROM information_schema.key_column_usage kcu
    WHERE kcu.constraint_schema = DATABASE()
      AND kcu.table_name = 'item_prices'
    GROUP BY kcu.constraint_name
    HAVING COUNT(*) = 1
      AND SUM(
        kcu.column_name = 'item_id'
        AND kcu.referenced_table_name = 'items'
        AND kcu.referenced_column_name = 'id'
      ) = 1
  ) legacy
);

SET @stmt = IF(
  @legacy_fk_drop_sql IS NULL OR CHAR_LENGTH(@legacy_fk_drop_sql) = 0,
  'SELECT 1',
  CONCAT('ALTER TABLE item_prices ', @legacy_fk_drop_sql)
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
