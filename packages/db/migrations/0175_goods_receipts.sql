-- Migration: 0175_goods_receipts.sql
-- Goods Receipts and Goods Receipt Lines tables
-- GR does NOT create journal entries (off-balance-sheet暂记 until invoiced)
-- GR lines reference PO lines optionally; update received_qty on PO lines
-- GR status: only RECEIVED (point-in-time immutable record)

CREATE TABLE IF NOT EXISTS goods_receipts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  supplier_id INT NOT NULL,
  reference_number VARCHAR(64) NOT NULL,
  receipt_date DATE NOT NULL,
  status TINYINT NOT NULL DEFAULT 40, -- 40=RECEIVED (matching PO status code)
  notes TEXT NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_gr_company (company_id),
  INDEX idx_gr_supplier (supplier_id),
  INDEX idx_gr_receipt_date (receipt_date),
  INDEX idx_gr_reference (reference_number),
  UNIQUE INDEX idx_gr_company_reference (company_id, reference_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS goods_receipt_lines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  receipt_id INT NOT NULL,
  line_no INT NOT NULL,
  po_line_id INT NULL,
  item_id INT NULL,
  description VARCHAR(255) NULL,
  qty DECIMAL(19,4) NOT NULL,
  unit VARCHAR(32) NULL,
  over_receipt_allowed TINYINT NOT NULL DEFAULT 0, -- 1=over-receipt confirmed
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_grl_company (company_id),
  INDEX idx_grl_receipt (receipt_id),
  INDEX idx_grl_po_line (po_line_id),
  CONSTRAINT fk_grl_receipt FOREIGN KEY (receipt_id) REFERENCES goods_receipts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notes:
-- status TINYINT uses same codes as PO (40=RECEIVED) for alignment, but GR has no transitions
-- over_receipt_allowed: set to 1 when user confirms receipt qty > remaining PO qty
-- GR does NOT touch inventory_stock directly (Story 46.5 PI will handle stock entry)