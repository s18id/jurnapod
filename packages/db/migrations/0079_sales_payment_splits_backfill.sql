-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Phase 8: Payment Enhancements - Backfill Migration (Rerunnable)
-- Creates split rows for all existing payments that don't have splits yet
-- Each existing payment gets one split row preserving original account_id

-- ============================================================
-- Backfill: Create split rows for existing payments without splits
-- Uses LEFT JOIN to find payments that don't have split_index=0 yet
-- Idempotent: safe to re-run multiple times
-- ============================================================

INSERT INTO sales_payment_splits (
  payment_id,
  company_id,
  outlet_id,
  split_index,
  account_id,
  amount
)
SELECT
  sp.id AS payment_id,
  sp.company_id,
  sp.outlet_id,
  0 AS split_index,
  sp.account_id,
  sp.amount
FROM sales_payments sp
LEFT JOIN sales_payment_splits sps 
  ON sps.payment_id = sp.id 
  AND sps.company_id = sp.company_id 
  AND sps.split_index = 0
WHERE sps.id IS NULL
ORDER BY sp.company_id, sp.id;

-- Verify backfill count
SELECT 
  COUNT(*) AS total_splits_created,
  COUNT(DISTINCT payment_id) AS payments_with_splits
FROM sales_payment_splits;
