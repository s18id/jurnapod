# Story 20.4: Mappings Consolidation

**Status:** done  
**Epic:** Epic 20  
**Story Points:** 5  
**Priority:** P2  
**Risk:** MEDIUM  
**Assigned:** unassigned  

---

## Overview

Consolidate four duplicate mapping tables into two unified tables: `account_mappings` and `payment_method_mappings`. This removes redundancy and simplifies the schema while preserving all existing data.

## Technical Details

### Database Changes

```sql
-- Create unified account_mappings table
CREATE TABLE account_mappings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NULL COMMENT 'NULL means company-wide mapping',
    mapping_type_id BIGINT UNSIGNED NOT NULL,
    mapping_key VARCHAR(255) NOT NULL,
    account_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_company_outlet_type_key (company_id, outlet_id, mapping_type_id, mapping_key),
    INDEX idx_company_id (company_id),
    INDEX idx_outlet_id (outlet_id),
    INDEX idx_account_id (account_id),
    INDEX idx_mapping_type_id (mapping_type_id),
    CONSTRAINT fk_am_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_am_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create unified payment_method_mappings table
CREATE TABLE payment_method_mappings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NULL COMMENT 'NULL means company-wide mapping',
    method_code VARCHAR(50) NOT NULL,
    account_id BIGINT UNSIGNED NOT NULL,
    is_invoice_default TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_company_outlet_method (company_id, outlet_id, method_code),
    INDEX idx_company_id (company_id),
    INDEX idx_outlet_id (outlet_id),
    INDEX idx_account_id (account_id),
    CONSTRAINT fk_pmm_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_pmm_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: Copy data from company_account_mappings
INSERT INTO account_mappings (company_id, outlet_id, mapping_type_id, mapping_key, account_id, created_at, updated_at)
SELECT company_id, NULL, mapping_type_id, mapping_key, account_id, created_at, updated_at
FROM company_account_mappings
ON DUPLICATE KEY UPDATE account_id = VALUES(account_id);

-- Migration: Copy data from outlet_account_mappings
INSERT INTO account_mappings (company_id, outlet_id, mapping_type_id, mapping_key, account_id, created_at, updated_at)
SELECT company_id, outlet_id, mapping_type_id, mapping_key, account_id, created_at, updated_at
FROM outlet_account_mappings
ON DUPLICATE KEY UPDATE account_id = VALUES(account_id);

-- Migration: Copy data from company_payment_method_mappings
INSERT INTO payment_method_mappings (company_id, outlet_id, method_code, account_id, is_invoice_default, created_at, updated_at)
SELECT company_id, NULL, method_code, account_id, is_invoice_default, created_at, updated_at
FROM company_payment_method_mappings
ON DUPLICATE KEY UPDATE account_id = VALUES(account_id);

-- Migration: Copy data from outlet_payment_method_mappings
INSERT INTO payment_method_mappings (company_id, outlet_id, method_code, account_id, is_invoice_default, created_at, updated_at)
SELECT company_id, outlet_id, method_code, account_id, is_invoice_default, created_at, updated_at
FROM company_payment_method_mappings
ON DUPLICATE KEY UPDATE account_id = VALUES(account_id);

-- Drop old tables (after verification)
-- DROP TABLE IF EXISTS company_account_mappings;
-- DROP TABLE IF EXISTS outlet_account_mappings;
-- DROP TABLE IF EXISTS company_payment_method_mappings;
-- DROP TABLE IF EXISTS outlet_payment_method_mappings;
```

### Files to Change

| File | Change |
|------|--------|
| `packages/shared/src/db/schema.ts` | Add account_mappings, payment_method_mappings |
| `apps/api/src/lib/accounts.ts` | Update mapping functions |
| `apps/api/src/lib/cash-bank.ts` | Update payment method mapping functions |
| `apps/api/src/routes/accounts.ts` | Update route handlers |
| `apps/api/src/routes/cash-bank.ts` | Update route handlers |

### Migration Steps

1. **Create tables**: Create account_mappings and payment_method_mappings
2. **Migrate company_account_mappings**: Copy to account_mappings with NULL outlet_id
3. **Migrate outlet_account_mappings**: Copy to account_mappings with outlet_id
4. **Migrate company_payment_method_mappings**: Copy to payment_method_mappings with NULL outlet_id
5. **Migrate outlet_payment_method_mappings**: Copy to payment_method_mappings with outlet_id
6. **Update code**: Update lib/accounts.ts and lib/cash-bank.ts
7. **Update routes**: Update route handlers
8. **Update schema**: Update shared DB schema
9. **Test**: Run mapping-related tests
10. **Drop tables**: Drop old tables after verification

## Acceptance Criteria

- [ ] account_mappings table created with proper indexes and FKs
- [ ] payment_method_mappings table created with proper indexes and FKs
- [ ] All data from company_account_mappings migrated
- [ ] All data from outlet_account_mappings migrated
- [ ] All data from company_payment_method_mappings migrated
- [ ] All data from outlet_payment_method_mappings migrated
- [ ] lib/accounts.ts updated
- [ ] lib/cash-bank.ts updated
- [ ] Route handlers updated
- [ ] No data loss (verify row counts)
- [ ] Old tables dropped only after full verification

## Dependencies

- Story 20.3 (Feature Flags) should complete first (quick win pattern)
