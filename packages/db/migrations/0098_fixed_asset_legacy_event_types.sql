-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Fixed Asset Lifecycle: Add legacy event type support
-- The CHECK constraint on event_type only allowed canonical types.
-- Service code supports legacy FA_* types via isAcquisitionType/isDisposalType helpers,
-- but DB constraint prevented storage of legacy events. This migration adds legacy types.
-- Portable across MySQL 8 and MariaDB.

SET @is_mariadb := ((SELECT @@version_comment) LIKE '%MariaDB%');
SET @constraint_name := 'chk_fixed_asset_events_type';
SET @new_check_clause := '''ACQUISITION'',''FA_ACQUISITION'',''DEPRECIATION'',''TRANSFER'',''IMPAIRMENT'',''DISPOSAL'',''FA_DISPOSAL'',''VOID''';

SET @constraint_exists := (
  SELECT COUNT(*) > 0
  FROM information_schema.TABLE_CONSTRAINTS tc
  WHERE tc.TABLE_SCHEMA = DATABASE()
    AND tc.TABLE_NAME = 'fixed_asset_events'
    AND tc.CONSTRAINT_NAME = @constraint_name
    AND tc.CONSTRAINT_TYPE = 'CHECK'
);

SET @check_has_legacy := (
  SELECT COUNT(*) > 0
  FROM information_schema.TABLE_CONSTRAINTS tc
  INNER JOIN information_schema.CHECK_CONSTRAINTS cc
    ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
   AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
  WHERE tc.TABLE_SCHEMA = DATABASE()
    AND tc.TABLE_NAME = 'fixed_asset_events'
    AND tc.CONSTRAINT_NAME = @constraint_name
    AND tc.CONSTRAINT_TYPE = 'CHECK'
    AND cc.CHECK_CLAUSE LIKE '%FA_ACQUISITION%'
    AND cc.CHECK_CLAUSE LIKE '%FA_DISPOSAL%'
);

SET @drop_sql := IF(
  @constraint_exists = 1 AND @check_has_legacy = 0,
  IF(
    @is_mariadb,
    CONCAT('ALTER TABLE fixed_asset_events DROP CONSTRAINT ', @constraint_name),
    CONCAT('ALTER TABLE fixed_asset_events DROP CHECK ', @constraint_name)
  ),
  'SELECT ''skip drop'''
);

PREPARE drop_stmt FROM @drop_sql;
EXECUTE drop_stmt;
DEALLOCATE PREPARE drop_stmt;

SET @add_sql := IF(
  @check_has_legacy = 0,
  CONCAT(
    'ALTER TABLE fixed_asset_events ADD CONSTRAINT ',
    @constraint_name,
    ' CHECK (event_type IN (',
    @new_check_clause,
    '))'
  ),
  'SELECT ''skip add'''
);

PREPARE add_stmt FROM @add_sql;
EXECUTE add_stmt;
DEALLOCATE PREPARE add_stmt;
