-- Migration: 0172_purchase_orders.sql
-- Purchase Orders and Purchase Order Lines tables
-- Status: DRAFT → SENT → PARTIAL_RECEIVED → RECEIVED → CLOSED

-- Purchase Orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  supplier_id INT NOT NULL,
  order_no VARCHAR(32) NOT NULL,
  order_date DATE NOT NULL,
  -- status (TINYINT): 1=DRAFT, 2=SENT, 3=PARTIAL_RECEIVED, 4=RECEIVED, 5=CLOSED
  status TINYINT NOT NULL DEFAULT 1,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'IDR',
  total_amount DECIMAL(19,4) NOT NULL DEFAULT 0,
  expected_date DATE NULL,
  notes TEXT NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_po_company (company_id),
  INDEX idx_po_supplier (supplier_id),
  INDEX idx_po_status (status),
  INDEX idx_po_order_date (order_date),
  UNIQUE INDEX idx_po_company_order_no (company_id, order_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Purchase Order Lines table
CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  order_id INT NOT NULL,
  line_no INT NOT NULL,
  item_id INT NULL,
  description VARCHAR(255) NULL,
  qty DECIMAL(19,4) NOT NULL,
  unit_price DECIMAL(19,4) NOT NULL,
  tax_rate DECIMAL(10,4) NOT NULL DEFAULT 0,
  received_qty DECIMAL(19,4) NOT NULL DEFAULT 0,
  line_total DECIMAL(19,4) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_pol_company (company_id),
  INDEX idx_pol_order (order_id),
  CONSTRAINT fk_pol_order FOREIGN KEY (order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notes:
-- line_total = qty * unit_price * (1 + tax_rate) - computed on insert/update
-- received_qty starts at 0, updated by GR creation (Story 46.4)
-- PO does NOT create journal entries (planning document only)
-- No UNIQUE constraint on (order_id, line_no) needed since we have auto-increment ID
