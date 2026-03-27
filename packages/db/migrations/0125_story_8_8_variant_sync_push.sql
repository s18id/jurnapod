-- Migration: Story 8.8 - Variant Sync Push Support
-- Description: Create variant_sales and variant_stock_adjustments tables for POS sync push

-- variant_sales: Track variant-level sales from POS sync
CREATE TABLE IF NOT EXISTS variant_sales (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  client_tx_id VARCHAR(255) NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  qty DECIMAL(10, 2) NOT NULL,
  unit_price DECIMAL(18, 2) NOT NULL,
  total_amount DECIMAL(18, 2) NOT NULL,
  trx_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_company_outlet_client (company_id, outlet_id, client_tx_id),
  INDEX idx_variant_trx (company_id, variant_id, trx_at),
  UNIQUE KEY uq_variant_sales_outlet_client (company_id, outlet_id, client_tx_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- variant_stock_adjustments: Track variant-level stock adjustments from POS sync
CREATE TABLE IF NOT EXISTS variant_stock_adjustments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  client_tx_id VARCHAR(255) NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  adjustment_type ENUM('INCREASE', 'DECREASE', 'SET') NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  previous_stock INT NOT NULL,
  new_stock INT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  reference VARCHAR(255) NULL,
  adjusted_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_company_outlet_client (company_id, outlet_id, client_tx_id),
  INDEX idx_variant_adjusted (company_id, variant_id, adjusted_at),
  UNIQUE KEY uq_variant_adjustments_outlet_client (company_id, outlet_id, client_tx_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;