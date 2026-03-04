-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'journal_batches'
      AND column_name = 'client_ref'
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE journal_batches ADD COLUMN client_ref CHAR(36) DEFAULT NULL AFTER doc_id'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'journal_batches'
      AND index_name = 'uq_journal_batches_company_doc_client_ref'
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE journal_batches ADD UNIQUE KEY uq_journal_batches_company_doc_client_ref (company_id, doc_type, client_ref)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'sales_invoices'
      AND column_name = 'client_ref'
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE sales_invoices ADD COLUMN client_ref CHAR(36) DEFAULT NULL AFTER invoice_date'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sales_invoices'
      AND index_name = 'uq_sales_invoices_company_client_ref'
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE sales_invoices ADD UNIQUE KEY uq_sales_invoices_company_client_ref (company_id, client_ref)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'sales_payments'
      AND column_name = 'client_ref'
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE sales_payments ADD COLUMN client_ref CHAR(36) DEFAULT NULL AFTER payment_no'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @stmt = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sales_payments'
      AND index_name = 'uq_sales_payments_company_client_ref'
    LIMIT 1
  ),
  'SELECT 1',
  'ALTER TABLE sales_payments ADD UNIQUE KEY uq_sales_payments_company_client_ref (company_id, client_ref)'
);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
