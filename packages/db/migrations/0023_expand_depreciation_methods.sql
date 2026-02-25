ALTER TABLE asset_depreciation_plans
  DROP CHECK chk_depr_plans_method,
  ADD CONSTRAINT chk_depr_plans_method CHECK (method IN ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'SUM_OF_YEARS'));

ALTER TABLE fixed_asset_categories
  DROP CHECK chk_fixed_asset_categories_method,
  ADD CONSTRAINT chk_fixed_asset_categories_method CHECK (depreciation_method IN ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'SUM_OF_YEARS'));
