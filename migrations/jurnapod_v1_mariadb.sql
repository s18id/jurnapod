-- Jurnapod ERP (Modular) - MySQL 8.0.44 Schema v1
-- Tagline: Dari kasir sampai neraca.
-- Modules included (Phase 1-2): Platform, Accounting/GL, Master Items, Sales (Invoice+Payments), POS (Offline Sync)
--
-- Notes:
-- - Engine: InnoDB, charset: utf8mb4
-- - Money: DECIMAL(18,2), Qty: DECIMAL(18,3)
-- - POS sync idempotency: pos_transactions.client_tx_id UNIQUE
-- - All tables are multi-tenant via company_id; outlet_id included where relevant.
--
-- You can run this as a single script.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- =========================
-- 0) OPTIONAL: schema_migrations
-- =========================
CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  version VARCHAR(50) NOT NULL,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_schema_migrations_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================
-- 1) PLATFORM MODULE
-- =========================

-- Companies (tenants)
CREATE TABLE IF NOT EXISTS companies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(200) NOT NULL,
  legal_name VARCHAR(200) NULL,
  tax_id VARCHAR(50) NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'IDR',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_companies_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Outlets (stores/branches)
CREATE TABLE IF NOT EXISTS outlets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(200) NOT NULL,
  address VARCHAR(500) NULL,
  timezone VARCHAR(64) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_outlets_company_code (company_id, code),
  KEY idx_outlets_company (company_id),
  CONSTRAINT fk_outlets_company FOREIGN KEY (company_id) REFERENCES companies(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Devices (for POS audit; optional but recommended)
CREATE TABLE IF NOT EXISTS devices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  outlet_id BIGINT UNSIGNED NOT NULL,
  device_code VARCHAR(64) NOT NULL,
  name VARCHAR(200) NULL,
  last_seen_at DATETIME(3) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_devices_device_code (device_code),
  KEY idx_devices_outlet (outlet_id),
  CONSTRAINT fk_devices_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(200) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_company_email (company_id, email),
  KEY idx_users_company (company_id),
  CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Roles (global role codes; you can seed OWNER/ADMIN/CASHIER/ACCOUNTANT)
CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User roles
CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role (role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User outlet access
CREATE TABLE IF NOT EXISTS user_outlets (
  user_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, outlet_id),
  KEY idx_user_outlets_outlet (outlet_id),
  CONSTRAINT fk_user_outlets_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_user_outlets_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit logs (JSON payload is compact summary, not full sensitive data)
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,          -- e.g., POS.VOID, ITEM.UPDATE, INVOICE.POST
  entity VARCHAR(80) NOT NULL,          -- e.g., pos_transaction, item, sales_invoice
  entity_id VARCHAR(80) NULL,
  at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  payload_json LONGTEXT NULL CHECK (JSON_VALID(payload_json)),
  PRIMARY KEY (id),
  KEY idx_audit_company_time (company_id, at),
  KEY idx_audit_outlet_time (outlet_id, at),
  KEY idx_audit_user_time (user_id, at),
  CONSTRAINT fk_audit_company FOREIGN KEY (company_id) REFERENCES companies(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_audit_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Number sequences (for invoice no, receipt no, journal ref, etc.)
-- scope examples: 'SALES_INVOICE', 'PAYMENT_IN', 'POS_RECEIPT', 'JOURNAL'
CREATE TABLE IF NOT EXISTS number_sequences (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NULL,
  scope VARCHAR(50) NOT NULL,
  prefix VARCHAR(50) NOT NULL,
  next_no BIGINT UNSIGNED NOT NULL DEFAULT 1,
  padding INT NOT NULL DEFAULT 6,
  reset_rule ENUM('NEVER','YEARLY','MONTHLY','DAILY') NOT NULL DEFAULT 'MONTHLY',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  config_json LONGTEXT NULL CHECK (JSON_VALID(config_json)),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_sequences_scope_prefix (company_id, outlet_id, scope, prefix),
  KEY idx_sequences_company (company_id),
  CONSTRAINT fk_sequences_company FOREIGN KEY (company_id) REFERENCES companies(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sequences_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Feature flags (modular enable/disable)
CREATE TABLE IF NOT EXISTS feature_flags (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  `key` VARCHAR(80) NOT NULL,  -- e.g., 'pos.enabled', 'inventory.enabled'
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  config_json LONGTEXT NULL CHECK (JSON_VALID(config_json)),       -- e.g., {"level":2}
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_feature_flags_company_key (company_id, `key`),
  CONSTRAINT fk_feature_flags_company FOREIGN KEY (company_id) REFERENCES companies(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================
-- 2) ACCOUNTING / GL MODULE
-- =========================

-- Chart of accounts (DA)
CREATE TABLE IF NOT EXISTS accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(50) NOT NULL,        -- e.g., 1-101
  name VARCHAR(200) NOT NULL,
  type ENUM('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE') NOT NULL,
  normal_side ENUM('D','K') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_accounts_company_code (company_id, code),
  KEY idx_accounts_company_type (company_id, type),
  CONSTRAINT fk_accounts_company FOREIGN KEY (company_id) REFERENCES companies(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fiscal period (simple open/close)
CREATE TABLE IF NOT EXISTS fiscal_periods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  year SMALLINT NOT NULL,
  month TINYINT UNSIGNED NOT NULL,
  status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  closed_at DATETIME(3) NULL,
  closed_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_period_company_year_month (company_id, year, month),
  KEY idx_period_company_status (company_id, status),
  CONSTRAINT fk_period_company FOREIGN KEY (company_id) REFERENCES companies(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_period_closed_by FOREIGN KEY (closed_by) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Journal batch (JRNL header)
CREATE TABLE IF NOT EXISTS journal_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NULL,
  ref VARCHAR(80) NOT NULL,  -- unique reference, can be sequence based
  doc_type VARCHAR(40) NULL, -- e.g., SALES_INVOICE, POS_SALE, PAYMENT_IN
  doc_id BIGINT UNSIGNED NULL,
  `date` DATE NOT NULL,
  memo VARCHAR(300) NULL,
  status ENUM('DRAFT','POSTED','VOID') NOT NULL DEFAULT 'POSTED',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_journal_company_ref (company_id, ref),
  KEY idx_journal_company_date (company_id, `date`),
  KEY idx_journal_outlet_date (outlet_id, `date`),
  CONSTRAINT fk_journal_company FOREIGN KEY (company_id) REFERENCES companies(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_journal_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_journal_created_by FOREIGN KEY (created_by) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Journal lines (JRNL lines)
CREATE TABLE IF NOT EXISTS journal_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id BIGINT UNSIGNED NOT NULL,
  line_no INT NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  description VARCHAR(300) NULL,
  debit DECIMAL(18,2) NOT NULL DEFAULT 0,
  credit DECIMAL(18,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_journal_lines_batch_lineno (batch_id, line_no),
  KEY idx_journal_lines_account (account_id),
  CONSTRAINT fk_journal_lines_batch FOREIGN KEY (batch_id) REFERENCES journal_batches(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_journal_lines_account FOREIGN KEY (account_id) REFERENCES accounts(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_journal_lines_nonnegative CHECK (debit >= 0 AND credit >= 0),
  CONSTRAINT chk_journal_lines_not_both CHECK (NOT (debit > 0 AND credit > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: outlet accounting mapping (to choose cash/revenue/tax accounts per outlet)
CREATE TABLE IF NOT EXISTS outlet_account_mappings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  outlet_id BIGINT UNSIGNED NOT NULL,
  cash_account_id BIGINT UNSIGNED NULL,
  bank_account_id BIGINT UNSIGNED NULL,
  qris_account_id BIGINT UNSIGNED NULL,
  sales_revenue_account_id BIGINT UNSIGNED NULL,     -- for POS
  service_revenue_account_id BIGINT UNSIGNED NULL,   -- for service invoices
  output_tax_account_id BIGINT UNSIGNED NULL,
  ar_account_id BIGINT UNSIGNED NULL,                -- accounts receivable
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_outlet_account_mappings_outlet (outlet_id),
  CONSTRAINT fk_oam_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_oam_cash FOREIGN KEY (cash_account_id) REFERENCES accounts(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_oam_bank FOREIGN KEY (bank_account_id) REFERENCES accounts(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_oam_qris FOREIGN KEY (qris_account_id) REFERENCES accounts(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_oam_sales_rev FOREIGN KEY (sales_revenue_account_id) REFERENCES accounts(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_oam_service_rev FOREIGN KEY (service_revenue_account_id) REFERENCES accounts(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_oam_tax FOREIGN KEY (output_tax_account_id) REFERENCES accounts(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_oam_ar FOREIGN KEY (ar_account_id) REFERENCES accounts(id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================
-- 3) MASTER ITEMS MODULE
-- =========================

CREATE TABLE IF NOT EXISTS items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  sku VARCHAR(80) NOT NULL,
  name VARCHAR(200) NOT NULL,
  item_type ENUM('SERVICE','PRODUCT','INGREDIENT','RECIPE') NOT NULL,
  uom VARCHAR(30) NOT NULL DEFAULT 'pcs',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_items_company_sku (company_id, sku),
  KEY idx_items_company_type (company_id, item_type),
  CONSTRAINT fk_items_company FOREIGN KEY (company_id) REFERENCES companies(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS item_prices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  price DECIMAL(18,2) NOT NULL,
  effective_from DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_item_prices_outlet_item (outlet_id, item_id),
  UNIQUE KEY uq_item_prices_version (item_id, outlet_id, effective_from),
  CONSTRAINT fk_item_prices_item FOREIGN KEY (item_id) REFERENCES items(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_item_prices_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_item_prices_nonnegative CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: tax profiles
CREATE TABLE IF NOT EXISTS tax_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  rate DECIMAL(8,4) NOT NULL DEFAULT 0, -- e.g., 0.1100 for 11%
  output_tax_account_id BIGINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_tax_profiles_company_name (company_id, name),
  CONSTRAINT fk_tax_profiles_company FOREIGN KEY (company_id) REFERENCES companies(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_tax_profiles_account FOREIGN KEY (output_tax_account_id) REFERENCES accounts(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT chk_tax_profiles_rate CHECK (rate >= 0 AND rate <= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS item_tax_profiles (
  item_id BIGINT UNSIGNED NOT NULL,
  tax_profile_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (item_id, tax_profile_id),
  CONSTRAINT fk_item_tax_item FOREIGN KEY (item_id) REFERENCES items(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_item_tax_profile FOREIGN KEY (tax_profile_id) REFERENCES tax_profiles(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================
-- 4) SALES MODULE (SERVICE INVOICE + PAYMENTS IN)
-- =========================

CREATE TABLE IF NOT EXISTS customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(50) NULL,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(50) NULL,
  email VARCHAR(255) NULL,
  tax_id VARCHAR(50) NULL,
  address VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_company_code (company_id, code),
  KEY idx_customers_company_name (company_id, name),
  CONSTRAINT fk_customers_company FOREIGN KEY (company_id) REFERENCES companies(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  invoice_no VARCHAR(80) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  `date` DATE NOT NULL,
  due_date DATE NULL,
  status ENUM('DRAFT','POSTED','VOID') NOT NULL DEFAULT 'DRAFT',
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  discount DECIMAL(18,2) NOT NULL DEFAULT 0,
  tax DECIMAL(18,2) NOT NULL DEFAULT 0,
  total DECIMAL(18,2) NOT NULL DEFAULT 0,
  notes VARCHAR(500) NULL,
  posted_at DATETIME(3) NULL,
  posted_by BIGINT UNSIGNED NULL,
  voided_at DATETIME(3) NULL,
  voided_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_sales_invoice_no (company_id, invoice_no),
  KEY idx_sales_invoices_outlet_date (outlet_id, `date`),
  KEY idx_sales_invoices_customer_date (customer_id, `date`),
  CONSTRAINT fk_sales_invoices_company FOREIGN KEY (company_id) REFERENCES companies(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sales_invoices_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sales_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_sales_invoices_posted_by FOREIGN KEY (posted_by) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_sales_invoices_voided_by FOREIGN KEY (voided_by) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_invoice_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id BIGINT UNSIGNED NOT NULL,
  line_no INT NOT NULL,
  item_id BIGINT UNSIGNED NULL,               -- can be NULL for custom service description
  description VARCHAR(300) NOT NULL,
  qty DECIMAL(18,3) NOT NULL DEFAULT 1,
  price DECIMAL(18,2) NOT NULL DEFAULT 0,
  discount DECIMAL(18,2) NOT NULL DEFAULT 0,
  tax DECIMAL(18,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sales_invoice_lines_invoice_lineno (invoice_id, line_no),
  KEY idx_sales_invoice_lines_item (item_id),
  CONSTRAINT fk_sales_invoice_lines_invoice FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_sales_invoice_lines_item FOREIGN KEY (item_id) REFERENCES items(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT chk_sales_invoice_lines_nonnegative CHECK (qty >= 0 AND price >= 0 AND discount >= 0 AND tax >= 0 AND line_total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payments in (receipts) for AR
CREATE TABLE IF NOT EXISTS payments_in (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  payment_no VARCHAR(80) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  `date` DATE NOT NULL,
  method ENUM('CASH','TRANSFER','QRIS','CARD','OTHER') NOT NULL DEFAULT 'TRANSFER',
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  ref_no VARCHAR(120) NULL,
  status ENUM('DRAFT','POSTED','VOID') NOT NULL DEFAULT 'DRAFT',
  posted_at DATETIME(3) NULL,
  posted_by BIGINT UNSIGNED NULL,
  voided_at DATETIME(3) NULL,
  voided_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_in_no (company_id, payment_no),
  KEY idx_payments_in_outlet_date (outlet_id, `date`),
  KEY idx_payments_in_customer_date (customer_id, `date`),
  CONSTRAINT fk_payments_in_company FOREIGN KEY (company_id) REFERENCES companies(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_payments_in_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_payments_in_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_payments_in_posted_by FOREIGN KEY (posted_by) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_payments_in_voided_by FOREIGN KEY (voided_by) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT chk_payments_in_amount CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Allocation of payments to invoices (supports partial payments)
CREATE TABLE IF NOT EXISTS payment_allocations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_in_id BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_allocations_unique (payment_in_id, invoice_id),
  KEY idx_payment_allocations_invoice (invoice_id),
  CONSTRAINT fk_payment_allocations_payment FOREIGN KEY (payment_in_id) REFERENCES payments_in(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_payment_allocations_invoice FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_payment_allocations_amount CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================
-- 5) POS MODULE (OFFLINE SYNC)
-- =========================

CREATE TABLE IF NOT EXISTS pos_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  cashier_user_id BIGINT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NULL,
  client_tx_id CHAR(36) NOT NULL,           -- UUID v4 from client
  tx_time DATETIME(3) NOT NULL,
  status ENUM('COMPLETED','VOID','REFUND') NOT NULL DEFAULT 'COMPLETED',
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  discount DECIMAL(18,2) NOT NULL DEFAULT 0,
  tax DECIMAL(18,2) NOT NULL DEFAULT 0,
  total DECIMAL(18,2) NOT NULL DEFAULT 0,
  note VARCHAR(300) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_pos_client_tx_id (client_tx_id),
  KEY idx_pos_outlet_time (outlet_id, tx_time),
  KEY idx_pos_cashier_time (cashier_user_id, tx_time),
  CONSTRAINT fk_pos_company FOREIGN KEY (company_id) REFERENCES companies(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_pos_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_pos_cashier FOREIGN KEY (cashier_user_id) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_pos_device FOREIGN KEY (device_id) REFERENCES devices(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT chk_pos_amounts CHECK (subtotal >= 0 AND discount >= 0 AND tax >= 0 AND total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pos_transaction_id BIGINT UNSIGNED NOT NULL,
  line_no INT NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  name_snapshot VARCHAR(200) NOT NULL,
  price_snapshot DECIMAL(18,2) NOT NULL DEFAULT 0,
  qty DECIMAL(18,3) NOT NULL DEFAULT 1,
  discount DECIMAL(18,2) NOT NULL DEFAULT 0,
  tax DECIMAL(18,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pos_items_tx_lineno (pos_transaction_id, line_no),
  KEY idx_pos_items_item (item_id),
  CONSTRAINT fk_pos_items_tx FOREIGN KEY (pos_transaction_id) REFERENCES pos_transactions(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT fk_pos_items_item FOREIGN KEY (item_id) REFERENCES items(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_pos_items_nonnegative CHECK (price_snapshot >= 0 AND qty >= 0 AND discount >= 0 AND tax >= 0 AND line_total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pos_transaction_id BIGINT UNSIGNED NOT NULL,
  method ENUM('CASH','TRANSFER','QRIS','CARD','OTHER') NOT NULL DEFAULT 'CASH',
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  ref_no VARCHAR(120) NULL,
  PRIMARY KEY (id),
  KEY idx_pos_payments_tx (pos_transaction_id),
  CONSTRAINT fk_pos_payments_tx FOREIGN KEY (pos_transaction_id) REFERENCES pos_transactions(id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT chk_pos_payments_amount CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional sync log (debugging device sync issues)
CREATE TABLE IF NOT EXISTS pos_sync_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  outlet_id BIGINT UNSIGNED NOT NULL,
  device_id BIGINT UNSIGNED NULL,
  client_tx_id CHAR(36) NOT NULL,
  pushed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  result ENUM('OK','DUPLICATE','ERROR') NOT NULL,
  error_message VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY idx_pos_sync_log_outlet_time (outlet_id, pushed_at),
  KEY idx_pos_sync_log_client (client_tx_id),
  CONSTRAINT fk_pos_sync_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_pos_sync_device FOREIGN KEY (device_id) REFERENCES devices(id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================
-- 6) OPTIONAL: ODS/EXCEL IMPORT METADATA (recommended)
-- =========================
CREATE TABLE IF NOT EXISTS data_imports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NULL,
  import_type ENUM('ODS','XLSX','CSV') NOT NULL,
  logical_type ENUM('COA','JOURNAL') NOT NULL, -- what the import contains
  file_name VARCHAR(255) NOT NULL,
  file_hash_sha256 CHAR(64) NOT NULL,
  period_year SMALLINT NULL,
  period_month TINYINT UNSIGNED NULL,
  uploaded_by BIGINT UNSIGNED NULL,
  uploaded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  status ENUM('RECEIVED','PROCESSED','FAILED') NOT NULL DEFAULT 'RECEIVED',
  error_message VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_data_imports_hash (company_id, file_hash_sha256),
  KEY idx_data_imports_company_time (company_id, uploaded_at),
  CONSTRAINT fk_data_imports_company FOREIGN KEY (company_id) REFERENCES companies(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_data_imports_outlet FOREIGN KEY (outlet_id) REFERENCES outlets(id)
    ON UPDATE RESTRICT ON DELETE SET NULL,
  CONSTRAINT fk_data_imports_user FOREIGN KEY (uploaded_by) REFERENCES users(id)
    ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================
-- 7) OPTIONAL: QUICK VIEWS (read-only helpers)
-- =========================

-- GL Trial balance by account (computed from journal lines)
-- Note: This is a convenience view; for performance you may introduce account_balances cache later.
CREATE OR REPLACE VIEW v_gl_account_totals AS
SELECT
  b.company_id,
  b.outlet_id,
  l.account_id,
  a.code AS account_code,
  a.name AS account_name,
  a.type AS account_type,
  b.`date`,
  SUM(l.debit) AS total_debit,
  SUM(l.credit) AS total_credit
FROM journal_batches b
JOIN journal_lines l ON l.batch_id = b.id
JOIN accounts a ON a.id = l.account_id
WHERE b.status = 'POSTED'
GROUP BY b.company_id, b.outlet_id, l.account_id, a.code, a.name, a.type, b.`date`;

-- POS daily totals
CREATE OR REPLACE VIEW v_pos_daily_totals AS
SELECT
  company_id,
  outlet_id,
  DATE(tx_time) AS tx_date,
  COUNT(*) AS tx_count,
  SUM(subtotal) AS subtotal,
  SUM(discount) AS discount,
  SUM(tax) AS tax,
  SUM(total) AS total
FROM pos_transactions
WHERE status = 'COMPLETED'
GROUP BY company_id, outlet_id, DATE(tx_time);

-- =========================
-- END
-- =========================
