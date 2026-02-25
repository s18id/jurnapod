-- Migration: Add account_id to sales_payments
-- Replaces method enum with FK to accounts (cash/bank accounts only via is_payable)

-- Add account_id column (nullable initially for backfill)
ALTER TABLE sales_payments
  ADD COLUMN account_id BIGINT UNSIGNED DEFAULT NULL AFTER invoice_id,
  ADD KEY idx_sales_payments_account (account_id),
  ADD CONSTRAINT fk_sales_payments_account
    FOREIGN KEY (account_id) REFERENCES accounts(id);

-- Backfill: map method strings to accounts
-- This assumes you have accounts named "Kas", "QRIS", "Bank Card" etc.
-- Adjust the mapping logic based on your actual account structure

-- Map CASH -> first Kas/Cash account marked as payable
UPDATE sales_payments sp
  JOIN accounts a ON (
    a.company_id = sp.company_id
    AND a.is_payable = 1
    AND (a.name LIKE '%Kas%' OR a.name LIKE '%Cash%')
  )
  SET sp.account_id = a.id
  WHERE sp.method = 'CASH'
    AND sp.account_id IS NULL
  LIMIT 1;

-- Map QRIS -> first QRIS account marked as payable
UPDATE sales_payments sp
  JOIN accounts a ON (
    a.company_id = sp.company_id
    AND a.is_payable = 1
    AND a.name LIKE '%QRIS%'
  )
  SET sp.account_id = a.id
  WHERE sp.method = 'QRIS'
    AND sp.account_id IS NULL;

-- Map CARD -> first Bank/Card account marked as payable
UPDATE sales_payments sp
  JOIN accounts a ON (
    a.company_id = sp.company_id
    AND a.is_payable = 1
    AND (a.name LIKE '%Bank%' OR a.name LIKE '%Card%' OR a.name LIKE '%Kartu%')
  )
  SET sp.account_id = a.id
  WHERE sp.method = 'CARD'
    AND sp.account_id IS NULL;

-- Make account_id NOT NULL after backfill
ALTER TABLE sales_payments
  MODIFY COLUMN account_id BIGINT UNSIGNED NOT NULL;

-- Optional: keep method column for backward compatibility during transition
-- or drop it if fully migrated:
-- ALTER TABLE sales_payments DROP COLUMN method;
