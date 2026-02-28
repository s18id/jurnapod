-- Migration: 0036_optimize_indexes_phase1.sql
-- Description: Add optimized compound indexes to improve query performance
-- Phase: 1 of 2 (ADD new indexes first, DROP redundant ones in Phase 2)
-- Impact: Zero downtime, improved query performance for multi-tenant and date-range queries

-- ====================================================================
-- PHASE 1: ADD NEW OPTIMIZED INDEXES
-- ====================================================================

-- 1. ACCOUNTS: Consolidate payable + active queries into covering index
ALTER TABLE accounts 
ADD INDEX idx_accounts_company_payable_active (company_id, is_payable, is_active, id);

-- 2. POS_TRANSACTIONS: Better compound indexes for date + status filters
ALTER TABLE pos_transactions 
ADD INDEX idx_pos_transactions_company_trx_status (company_id, trx_at, status, id);

ALTER TABLE pos_transactions 
ADD INDEX idx_pos_transactions_company_outlet_trx (company_id, outlet_id, trx_at, status);

-- 3. JOURNAL_BATCHES: Enhanced date range + outlet queries
ALTER TABLE journal_batches 
ADD INDEX idx_journal_batches_company_posted_outlet (company_id, posted_at, outlet_id, id);

ALTER TABLE journal_batches 
ADD INDEX idx_journal_batches_doctype_docid (doc_type, doc_id);

-- 4. JOURNAL_LINES: Optimized ledger queries with account/outlet filters
ALTER TABLE journal_lines 
ADD INDEX idx_journal_lines_company_date_account (company_id, line_date, account_id, outlet_id);

ALTER TABLE journal_lines 
ADD INDEX idx_journal_lines_company_date_outlet (company_id, line_date, outlet_id, account_id);

-- 5. AUDIT_LOGS: Better action + entity queries
ALTER TABLE audit_logs 
ADD INDEX idx_audit_logs_action_result_created (action, result, created_at);

ALTER TABLE audit_logs 
ADD INDEX idx_audit_logs_company_entity_type_created (company_id, entity_type, entity_id, created_at);

-- 6. SALES_INVOICES: Date + status compound indexes
ALTER TABLE sales_invoices 
ADD INDEX idx_sales_invoices_company_date_status (company_id, invoice_date, status, outlet_id);

ALTER TABLE sales_invoices 
ADD INDEX idx_sales_invoices_company_outlet_date (company_id, outlet_id, invoice_date, status);

-- 7. SALES_PAYMENTS: Company + invoice compound index
ALTER TABLE sales_payments 
ADD INDEX idx_sales_payments_company_invoice (company_id, invoice_id, payment_at);

-- 8. ITEMS: Covering index for active listings
ALTER TABLE items 
ADD INDEX idx_items_company_active_id (company_id, is_active, id);

-- 9. ASSET_DEPRECIATION_PLANS: Asset + status compound index
ALTER TABLE asset_depreciation_plans 
ADD INDEX idx_depr_plans_company_asset_status (company_id, asset_id, status, id);

-- 10. ASSET_DEPRECIATION_RUNS: Plan + status compound index
ALTER TABLE asset_depreciation_runs 
ADD INDEX idx_depr_runs_plan_status (plan_id, status, period_year, period_month);

-- ====================================================================
-- NOTES:
-- - These indexes improve query performance for multi-tenant queries
-- - All indexes start with company_id for optimal data locality
-- - Compound indexes include covering columns (id) to reduce table access
-- - Phase 2 will remove redundant indexes (see migration 0037)
-- ====================================================================
