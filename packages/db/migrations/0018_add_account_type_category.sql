-- Migration: Add category column to account_types
-- Description: Add standard account category (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)
--              and map existing Indonesian type names to their categories

-- Add category column
ALTER TABLE account_types 
  ADD COLUMN category VARCHAR(20) NULL 
    COMMENT 'Standard account category: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE'
    AFTER name;

-- Add index for category filtering
CREATE INDEX idx_account_types_category ON account_types (company_id, category, is_active);

-- Map Indonesian type names to standard categories
-- ASSET types
UPDATE account_types SET category = 'ASSET' 
WHERE name IN ('Kas', 'Bank', 'Akun Piutang', 'Aktiva Lancar Lainnya', 'Aktiva Tetap');

-- LIABILITY types
UPDATE account_types SET category = 'LIABILITY'
WHERE name IN ('Akun Hutang', 'Akun Hutang Lainnya');

-- EQUITY types
UPDATE account_types SET category = 'EQUITY'
WHERE name IN ('Ekuitas', 'Kontra Ekuitas');

-- Contra-asset (technically negative asset, but we'll classify as ASSET with special handling)
UPDATE account_types SET category = 'ASSET'
WHERE name = 'Kontra Aktiva';

-- REVENUE types
UPDATE account_types SET category = 'REVENUE'
WHERE name = 'Pendapatan';

-- EXPENSE types
UPDATE account_types SET category = 'EXPENSE'
WHERE name IN ('Beban Administrasi dan Umum', 'Beban Lain-lain', 'Beban Pajak Perusahaan');

-- Display mapping results
SELECT 
  category,
  name,
  normal_balance,
  report_group
FROM account_types
WHERE company_id = 1
ORDER BY category, name;
