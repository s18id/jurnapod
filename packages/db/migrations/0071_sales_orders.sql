-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Sales Orders: PO -> Invoice workflow
-- Status flow: DRAFT -> CONFIRMED -> COMPLETED
--               DRAFT -> VOID
--               CONFIRMED -> VOID

CREATE TABLE IF NOT EXISTS sales_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  order_no VARCHAR(64) NOT NULL,
  order_date DATE NOT NULL,
  expected_date DATE DEFAULT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  notes TEXT DEFAULT NULL,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  grand_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  updated_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  confirmed_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  confirmed_at DATETIME DEFAULT NULL,
  completed_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sales_orders_company_order_no (company_id, order_no),
  KEY idx_sales_orders_company_order_date (company_id, order_date),
  KEY idx_sales_orders_outlet_order_date (outlet_id, order_date),
  KEY idx_sales_orders_company_status (company_id, status),
  KEY idx_sales_orders_scope_id (company_id, outlet_id, id),
  CONSTRAINT chk_sales_orders_status CHECK (status IN ('DRAFT', 'CONFIRMED', 'COMPLETED', 'VOID')),
  CONSTRAINT chk_sales_orders_subtotal_non_negative CHECK (subtotal >= 0),
  CONSTRAINT chk_sales_orders_tax_amount_non_negative CHECK (tax_amount >= 0),
  CONSTRAINT chk_sales_orders_grand_total_non_negative CHECK (grand_total >= 0),
  CONSTRAINT chk_sales_orders_grand_total_formula CHECK (grand_total = subtotal + tax_amount),
  CONSTRAINT fk_sales_orders_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_sales_orders_outlet_scoped FOREIGN KEY (company_id, outlet_id) REFERENCES outlets(company_id, id),
  CONSTRAINT fk_sales_orders_created_by_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_orders_updated_by_user FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_orders_confirmed_by_user FOREIGN KEY (confirmed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_orders_completed_by_user FOREIGN KEY (completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales_order_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  line_no INT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  qty DECIMAL(18,4) NOT NULL,
  unit_price DECIMAL(18,2) NOT NULL,
  line_total DECIMAL(18,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sales_order_lines_order_line_no (order_id, line_no),
  KEY idx_sales_order_lines_company_created_at (company_id, created_at),
  KEY idx_sales_order_lines_outlet_created_at (outlet_id, created_at),
  KEY idx_sales_order_lines_scope_order (company_id, outlet_id, order_id),
  CONSTRAINT chk_sales_order_lines_qty_positive CHECK (qty > 0),
  CONSTRAINT chk_sales_order_lines_unit_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT chk_sales_order_lines_line_total_non_negative CHECK (line_total >= 0),
  CONSTRAINT fk_sales_order_lines_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_sales_order_lines_outlet_scoped FOREIGN KEY (company_id, outlet_id) REFERENCES outlets(company_id, id),
  CONSTRAINT fk_sales_order_lines_order_scoped FOREIGN KEY (company_id, outlet_id, order_id) REFERENCES sales_orders(company_id, outlet_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Link sales_invoices to sales_orders (optional - for PO -> Invoice workflow)
SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoices'
    AND COLUMN_NAME = 'order_id'
);

SET @add_column_sql := IF(
  @column_exists = 0,
  'ALTER TABLE sales_invoices ADD COLUMN order_id BIGINT UNSIGNED DEFAULT NULL AFTER outlet_id',
  'SELECT 1'
);

PREPARE add_column_stmt FROM @add_column_sql;
EXECUTE add_column_stmt;
DEALLOCATE PREPARE add_column_stmt;

-- Add foreign key after column exists
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sales_invoices'
    AND CONSTRAINT_NAME = 'fk_sales_invoices_order_scoped'
);

SET @add_fk_sql := IF(
  @fk_exists = 0,
  'ALTER TABLE sales_invoices ADD CONSTRAINT fk_sales_invoices_order_scoped FOREIGN KEY (company_id, outlet_id, order_id) REFERENCES sales_orders(company_id, outlet_id, id) ON DELETE RESTRICT',
  'SELECT 1'
);

PREPARE add_fk_stmt FROM @add_fk_sql;
EXECUTE add_fk_stmt;
DEALLOCATE PREPARE add_fk_stmt;
