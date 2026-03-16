-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- ============================================================
-- Migration: Add currency_code support to companies table
-- ============================================================

-- Add currency_code column to companies table
ALTER TABLE companies 
  ADD COLUMN currency_code VARCHAR(3) NULL DEFAULT 'IDR' 
  AFTER timezone;

-- Create index for currency lookups
CREATE INDEX idx_companies_currency_code ON companies(currency_code);

-- ============================================================
-- Notes:
-- - currency_code column stores ISO 4217 currency codes (e.g., 'IDR', 'USD', 'SGD')
-- - NULL defaults to 'IDR' for backward compatibility
-- - Used for forex calculations and multi-currency reporting
-- ============================================================
