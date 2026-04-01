# Story 20.2: Module Configuration Normalization

**Status:** backlog  
**Epic:** Epic 20  
**Story Points:** 5  
**Priority:** P2  
**Risk:** MEDIUM  
**Assigned:** unassigned  

---

## Overview

Normalize the `company_modules` table by replacing the `config_json` column with explicit typed columns for POS, inventory, sales, and purchasing module settings. Add proper FK constraints for account_id references.

## Technical Details

### Database Changes

```sql
-- Add explicit columns to company_modules (additive, then drop config_json after migration)
ALTER TABLE company_modules
    ADD COLUMN pos_enabled TINYINT(1) DEFAULT 1,
    ADD COLUMN pos_offline_mode TINYINT(1) DEFAULT 0,
    ADD COLUMN pos_receipt_template VARCHAR(255) DEFAULT 'default',
    ADD COLUMN pos_auto_sync TINYINT(1) DEFAULT 1,
    ADD COLUMN pos_sync_interval_seconds INT DEFAULT 30,
    ADD COLUMN pos_require_auth TINYINT(1) DEFAULT 1,
    ADD COLUMN pos Allow_discount_after_tax TINYINT(1) DEFAULT 0,
    ADD COLUMN pos_default_payment_method_id BIGINT UNSIGNED NULL,
    ADD COLUMN pos_tip_adjustment_enabled TINYINT(1) DEFAULT 0,
    ADD COLUMN inventory_enabled TINYINT(1) DEFAULT 1,
    ADD COLUMN inventory_multi_warehouse TINYINT(1) DEFAULT 0,
    ADD COLUMN inventory_warehouses JSON NULL,
    ADD COLUMN inventory_auto_reorder TINYINT(1) DEFAULT 0,
    ADD COLUMN inventory_low_stock_threshold INT DEFAULT 10,
    ADD COLUMN inventory_default_asset_account_id BIGINT UNSIGNED NULL,
    ADD COLUMN inventory_default_cogs_account_id BIGINT UNSIGNED NULL,
    ADD COLUMN sales_enabled TINYINT(1) DEFAULT 1,
    ADD COLUMN sales_tax_mode ENUM('inclusive', 'exclusive', 'mixed') DEFAULT 'inclusive',
    ADD COLUMN sales_default_tax_rate_id BIGINT UNSIGNED NULL,
    ADD COLUMN sales_allow_partial_pay TINYINT(1) DEFAULT 1,
    ADD COLUMN sales_credit_limit_enabled TINYINT(1) DEFAULT 0,
    ADD COLUMN sales_default_price_list_id BIGINT UNSIGNED NULL,
    ADD COLUMN sales_default_income_account_id BIGINT UNSIGNED NULL,
    ADD COLUMN purchasing_enabled TINYINT(1) DEFAULT 0,
    ADD COLUMN purchasing_approval_workflow TINYINT(1) DEFAULT 0,
    ADD COLUMN purchasing_default_tax_rate_id BIGINT UNSIGNED NULL,
    ADD COLUMN purchasing_default_expense_account_id BIGINT UNSIGNED NULL,
    ADD COLUMN purchasing_credit_limit_enabled TINYINT(1) DEFAULT 0,
    ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Add FK constraints for account references
ALTER TABLE company_modules
    ADD CONSTRAINT fk_cm_pos_payment_method FOREIGN KEY (pos_default_payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_cm_inventory_asset_account FOREIGN KEY (inventory_default_asset_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_cm_inventory_cogs_account FOREIGN KEY (inventory_default_cogs_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_cm_sales_tax_rate FOREIGN KEY (sales_default_tax_rate_id) REFERENCES tax_rates(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_cm_sales_price_list FOREIGN KEY (sales_default_price_list_id) REFERENCES price_lists(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_cm_sales_income_account FOREIGN KEY (sales_default_income_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_cm_purchasing_tax_rate FOREIGN KEY (purchasing_default_tax_rate_id) REFERENCES tax_rates(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_cm_purchasing_expense_account FOREIGN KEY (purchasing_default_expense_account_id) REFERENCES accounts(id) ON DELETE SET NULL;

-- Migration: Populate new columns from config_json
-- This is a one-time migration script
UPDATE company_modules SET
    pos_enabled = COALESCE(JSON_EXTRACT(config_json, '$.pos.enabled'), 1),
    pos_offline_mode = COALESCE(JSON_EXTRACT(config_json, '$.pos.offline_mode'), 0),
    pos_receipt_template = COALESCE(JSON_EXTRACT(config_json, '$.pos.receipt_template'), 'default'),
    -- ... (full migration of all fields)
WHERE config_json IS NOT NULL;

-- Drop config_json column after verification
-- ALTER TABLE company_modules DROP COLUMN config_json;
```

### Files to Change

| File | Change |
|------|--------|
| `packages/shared/src/db/schema.ts` | Update company_modules definition |
| `apps/api/src/lib/modules/accounting.ts` | Update to use explicit columns |
| `apps/api/src/lib/modules/platform.ts` | Update to use explicit columns |
| `apps/api/src/lib/modules/pos.ts` | Update to use explicit columns |
| `apps/api/src/lib/modules/inventory.ts` | Update to use explicit columns |
| `apps/api/src/routes/company-modules.ts` | Update route handlers |

### Migration Steps

1. **Add columns**: Add all explicit columns to company_modules (additive)
2. **Add constraints**: Add FK constraints for account_id references
3. **Migrate data**: Run migration script to populate columns from config_json
4. **Update code**: Update all modules/*.ts files to use explicit columns
5. **Update routes**: Update company-modules route handlers
6. **Update schema**: Update shared DB schema types
7. **Test**: Run module-related tests
8. **Verify**: Ensure all config_json usages are migrated
9. **Drop column**: Remove config_json after 48h monitoring

## Acceptance Criteria

- [ ] All new columns added to company_modules
- [ ] FK constraints added for all account_id references
- [ ] config_json data migrated to explicit columns
- [ ] lib/modules/*.ts updated to use explicit columns
- [ ] Route handlers updated
- [ ] Shared schema types updated
- [ ] No functionality regression
- [ ] config_json dropped only after full verification

## Dependencies

- Story 20.1 (Settings) must be complete (settings is prerequisite for pattern)
