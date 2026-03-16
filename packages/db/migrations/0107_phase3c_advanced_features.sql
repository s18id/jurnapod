-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration 0107: Phase 3C Advanced Features
-- - Scheduled exports for automated report delivery
-- - Export file storage metadata
-- - Sales forecasting with statistical predictions
-- - Analytics insights cache

-- Add attachment_path to email_outbox for export file delivery
ALTER TABLE email_outbox 
ADD COLUMN attachment_path VARCHAR(500) NULL AFTER text;

-- Create scheduled exports table for automated report delivery
CREATE TABLE IF NOT EXISTS scheduled_exports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    report_type ENUM('SALES', 'FINANCIAL', 'INVENTORY', 'AUDIT', 'POS_TRANSACTIONS', 'JOURNAL') NOT NULL,
    export_format ENUM('CSV', 'XLSX', 'JSON') NOT NULL DEFAULT 'CSV',
    schedule_type ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'ONCE') NOT NULL,
    schedule_config JSON NOT NULL COMMENT '{"hour": 0, "dayOfWeek": null, "dayOfMonth": null}',
    filters JSON NULL COMMENT '{"dateRange": {start, end}, "outlets": [], "status": []}',
    recipients JSON NOT NULL COMMENT '[{"email": "user@example.com", "type": "TO"}]',
    delivery_method ENUM('EMAIL', 'DOWNLOAD', 'WEBHOOK') NOT NULL DEFAULT 'EMAIL',
    webhook_url VARCHAR(500) NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_run_at DATETIME NULL,
    next_run_at DATETIME NOT NULL,
    created_by_user_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_scheduled_exports_company (company_id),
    INDEX idx_scheduled_exports_next_run (next_run_at, is_active),
    INDEX idx_scheduled_exports_active (company_id, is_active),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create export files table for storage metadata
CREATE TABLE IF NOT EXISTS export_files (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    scheduled_export_id BIGINT UNSIGNED NULL,
    batch_job_id VARCHAR(36) NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT UNSIGNED NOT NULL,
    file_path VARCHAR(500) NOT NULL COMMENT 'Local path or S3 key',
    storage_provider ENUM('LOCAL', 'S3') NOT NULL DEFAULT 'LOCAL',
    expires_at DATETIME NULL,
    download_count INT UNSIGNED NOT NULL DEFAULT 0,
    last_downloaded_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_export_files_company (company_id),
    INDEX idx_export_files_expires (expires_at),
    INDEX idx_export_files_scheduled (scheduled_export_id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (scheduled_export_id) REFERENCES scheduled_exports(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create sales forecasts table for predictive analytics
CREATE TABLE IF NOT EXISTS sales_forecasts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NULL,
    forecast_type ENUM('DAILY', 'WEEKLY', 'MONTHLY') NOT NULL,
    forecast_date DATE NOT NULL,
    predicted_amount DECIMAL(18,2) NOT NULL,
    confidence_lower DECIMAL(18,2) NULL,
    confidence_upper DECIMAL(18,2) NULL,
    model_version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sales_forecasts_company (company_id),
    INDEX idx_sales_forecasts_date (forecast_date),
    INDEX idx_sales_forecasts_outlet (outlet_id),
    UNIQUE KEY uniq_forecast (company_id, outlet_id, forecast_type, forecast_date),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create analytics insights table for business intelligence
CREATE TABLE IF NOT EXISTS analytics_insights (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT UNSIGNED NOT NULL,
    insight_type ENUM('TREND', 'ANOMALY', 'SEASONALITY', 'PEAK_HOURS', 'TOP_PRODUCTS', 'UNDERPERFORMING') NOT NULL,
    outlet_id BIGINT UNSIGNED NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(18,4) NOT NULL,
    reference_period VARCHAR(50) NOT NULL COMMENT 'e.g., 2024-Q1, last-30-days',
    severity ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL DEFAULT 'INFO',
    description TEXT NOT NULL,
    recommendation TEXT NULL,
    calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    INDEX idx_analytics_insights_company (company_id),
    INDEX idx_analytics_insights_type (insight_type),
    INDEX idx_analytics_insights_expires (expires_at),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
