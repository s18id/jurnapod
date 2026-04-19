-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: 0186_fiscal_periods.sql
-- Epic 47 Wave 0: Batch 1 schema blockers - fiscal_periods
-- Description: Create fiscal_periods table for AP automation
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;
SET UNIQUE_CHECKS=0;

CREATE TABLE IF NOT EXISTS fiscal_periods (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    fiscal_year_id BIGINT UNSIGNED NOT NULL,
    period_no INT UNSIGNED NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1=OPEN, 2=CLOSED',
    closed_at DATETIME DEFAULT NULL,
    closed_by_user_id BIGINT UNSIGNED DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_fiscal_periods_company_year_period (company_id, fiscal_year_id, period_no),
    INDEX idx_fiscal_periods_company_id (company_id),
    INDEX idx_fiscal_periods_fiscal_year_id (fiscal_year_id),
    INDEX idx_fiscal_periods_status (status),
    INDEX idx_fiscal_periods_start_date (start_date),
    INDEX idx_fiscal_periods_end_date (end_date),

    CONSTRAINT fk_fiscal_periods_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_fiscal_periods_fiscal_year FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_fiscal_periods_closed_by_user FOREIGN KEY (closed_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
SET UNIQUE_CHECKS=1;
