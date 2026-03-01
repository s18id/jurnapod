-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

SET @depr_plan_constraint := (
  SELECT CONSTRAINT_NAME
  FROM information_schema.CHECK_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND CONSTRAINT_NAME = 'chk_depr_plans_method'
  LIMIT 1
);

SET @drop_depr_plan_sql := IF(
  @depr_plan_constraint IS NULL,
  'SELECT 1',
  'ALTER TABLE asset_depreciation_plans DROP CONSTRAINT chk_depr_plans_method'
);
PREPARE drop_depr_plan_stmt FROM @drop_depr_plan_sql;
EXECUTE drop_depr_plan_stmt;
DEALLOCATE PREPARE drop_depr_plan_stmt;

SET @add_depr_plan_sql := IF(
  @depr_plan_constraint IS NULL,
  'ALTER TABLE asset_depreciation_plans ADD CONSTRAINT chk_depr_plans_method CHECK (method IN (''STRAIGHT_LINE'', ''DECLINING_BALANCE'', ''SUM_OF_YEARS''))',
  'ALTER TABLE asset_depreciation_plans ADD CONSTRAINT chk_depr_plans_method CHECK (method IN (''STRAIGHT_LINE'', ''DECLINING_BALANCE'', ''SUM_OF_YEARS''))'
);
PREPARE add_depr_plan_stmt FROM @add_depr_plan_sql;
EXECUTE add_depr_plan_stmt;
DEALLOCATE PREPARE add_depr_plan_stmt;

SET @category_constraint := (
  SELECT CONSTRAINT_NAME
  FROM information_schema.CHECK_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND CONSTRAINT_NAME = 'chk_fixed_asset_categories_method'
  LIMIT 1
);

SET @drop_category_sql := IF(
  @category_constraint IS NULL,
  'SELECT 1',
  'ALTER TABLE fixed_asset_categories DROP CONSTRAINT chk_fixed_asset_categories_method'
);
PREPARE drop_category_stmt FROM @drop_category_sql;
EXECUTE drop_category_stmt;
DEALLOCATE PREPARE drop_category_stmt;

SET @add_category_sql := IF(
  @category_constraint IS NULL,
  'ALTER TABLE fixed_asset_categories ADD CONSTRAINT chk_fixed_asset_categories_method CHECK (depreciation_method IN (''STRAIGHT_LINE'', ''DECLINING_BALANCE'', ''SUM_OF_YEARS''))',
  'ALTER TABLE fixed_asset_categories ADD CONSTRAINT chk_fixed_asset_categories_method CHECK (depreciation_method IN (''STRAIGHT_LINE'', ''DECLINING_BALANCE'', ''SUM_OF_YEARS''))'
);
PREPARE add_category_stmt FROM @add_category_sql;
EXECUTE add_category_stmt;
DEALLOCATE PREPARE add_category_stmt;
