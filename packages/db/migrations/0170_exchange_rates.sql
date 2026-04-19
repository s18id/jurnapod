-- Migration: 0170_exchange_rates.sql
-- Story: Epic 46.2 - Exchange Rate Table
-- Description: Create exchange_rates table for multi-currency purchasing.
--              Company-scoped, keyed by (company_id, currency_code, effective_date).
--              Rates are append-only per date — update by inserting new effective_date.
-- Created: 2026-04-19

CREATE TABLE IF NOT EXISTS exchange_rates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    currency_code CHAR(3) NOT NULL,
    effective_date DATE NOT NULL,
    rate DECIMAL(19,8) NOT NULL COMMENT 'Exchange rate: 1 unit of foreign currency = rate in company base currency',
    notes TEXT DEFAULT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by_user_id INT DEFAULT NULL,
    updated_by_user_id INT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_exchange_rates_company_currency_date (company_id, currency_code, effective_date),
    INDEX idx_exchange_rates_company_id (company_id),
    INDEX idx_exchange_rates_currency_date (currency_code, effective_date),

    CONSTRAINT fk_exchange_rates_company FOREIGN KEY (company_id)
        REFERENCES companies(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;