-- Migration 0106: Modular Sync Architecture Tables
-- Add support for tier-based sync with POS and backoffice differentiation
-- Maintains backward compatibility with existing sync_data_versions

-- Create sync tier versions table for multi-tier version tracking
CREATE TABLE IF NOT EXISTS sync_tier_versions (
    company_id BIGINT UNSIGNED NOT NULL,
    tier ENUM('REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN', 'ANALYTICS') NOT NULL,
    current_version INT UNSIGNED NOT NULL DEFAULT 0,
    last_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id, tier),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    INDEX idx_sync_tier_versions_company (company_id),
    INDEX idx_sync_tier_versions_updated (last_updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create POS sync metadata for tracking per-outlet sync status
CREATE TABLE IF NOT EXISTS pos_sync_metadata (
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NOT NULL,
    tier ENUM('REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN') NOT NULL,
    last_sync_at DATETIME NULL,
    last_version INT UNSIGNED NULL,
    sync_status ENUM('OK', 'ERROR', 'STALE') NOT NULL DEFAULT 'OK',
    error_message TEXT NULL,
    sync_frequency_ms INT UNSIGNED NULL COMMENT 'Override default frequency for this outlet/tier',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id, outlet_id, tier),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    INDEX idx_pos_sync_metadata_company (company_id),
    INDEX idx_pos_sync_metadata_outlet (outlet_id),
    INDEX idx_pos_sync_metadata_status (sync_status),
    INDEX idx_pos_sync_metadata_sync_at (last_sync_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create backoffice sync queue for document-based sync processing
CREATE TABLE IF NOT EXISTS backoffice_sync_queue (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id BIGINT UNSIGNED NOT NULL,
    document_type ENUM('INVOICE', 'PAYMENT', 'JOURNAL', 'REPORT', 'RECONCILIATION') NOT NULL,
    document_id BIGINT UNSIGNED NOT NULL,
    tier ENUM('OPERATIONAL', 'MASTER', 'ADMIN', 'ANALYTICS') NOT NULL,
    sync_status ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
    scheduled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processing_started_at DATETIME NULL,
    processed_at DATETIME NULL,
    retry_count INT UNSIGNED NOT NULL DEFAULT 0,
    max_retries INT UNSIGNED NOT NULL DEFAULT 3,
    error_message TEXT NULL,
    payload_hash VARCHAR(64) NULL COMMENT 'SHA-256 hash for duplicate detection',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_backoffice_sync_document (company_id, document_type, document_id, payload_hash),
    INDEX idx_backoffice_sync_queue_company (company_id),
    INDEX idx_backoffice_sync_queue_status (sync_status),
    INDEX idx_backoffice_sync_queue_scheduled (scheduled_at),
    INDEX idx_backoffice_sync_queue_tier (tier),
    INDEX idx_backoffice_sync_queue_retry (retry_count, max_retries),
    INDEX idx_backoffice_sync_queue_document (document_type, document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create sync operations tracking table for monitoring and analytics
CREATE TABLE IF NOT EXISTS sync_operations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id BIGINT UNSIGNED NOT NULL,
    outlet_id BIGINT UNSIGNED NULL COMMENT 'NULL for backoffice operations',
    sync_module ENUM('POS', 'BACKOFFICE') NOT NULL,
    tier ENUM('REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN', 'ANALYTICS') NOT NULL,
    operation_type ENUM('PUSH', 'PULL', 'RECONCILE', 'BATCH') NOT NULL,
    request_id VARCHAR(36) NOT NULL COMMENT 'UUID for correlation',
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    status ENUM('RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'RUNNING',
    records_processed INT UNSIGNED NULL,
    data_version_before INT UNSIGNED NULL,
    data_version_after INT UNSIGNED NULL,
    error_message TEXT NULL,
    result_summary JSON NULL COMMENT 'Additional operation metadata',
    duration_ms INT UNSIGNED GENERATED ALWAYS AS (
        CASE 
            WHEN completed_at IS NOT NULL THEN TIMESTAMPDIFF(MICROSECOND, started_at, completed_at) / 1000
            ELSE NULL 
        END
    ) STORED,
    PRIMARY KEY (id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_sync_operations_request (request_id),
    INDEX idx_sync_operations_company (company_id),
    INDEX idx_sync_operations_outlet (outlet_id),
    INDEX idx_sync_operations_module_tier (sync_module, tier),
    INDEX idx_sync_operations_status (status),
    INDEX idx_sync_operations_started (started_at),
    INDEX idx_sync_operations_duration (duration_ms),
    INDEX idx_sync_operations_completed (completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initialize sync tier versions for existing companies with MASTER tier version from sync_data_versions
INSERT IGNORE INTO sync_tier_versions (company_id, tier, current_version, last_updated_at)
SELECT 
    company_id,
    'MASTER' as tier,
    current_version,
    NOW() as last_updated_at
FROM sync_data_versions
WHERE current_version IS NOT NULL;

-- Initialize other tiers with version 0 for existing companies
INSERT IGNORE INTO sync_tier_versions (company_id, tier, current_version, last_updated_at)
SELECT 
    c.id as company_id,
    tier_enum.tier,
    0 as current_version,
    NOW() as last_updated_at
FROM companies c
CROSS JOIN (
    SELECT 'REALTIME' as tier
    UNION ALL SELECT 'OPERATIONAL'
    UNION ALL SELECT 'ADMIN' 
    UNION ALL SELECT 'ANALYTICS'
) tier_enum
WHERE c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM sync_tier_versions stv 
    WHERE stv.company_id = c.id AND stv.tier = tier_enum.tier
  );

-- Initialize POS sync metadata for existing outlets with default MASTER tier tracking
INSERT IGNORE INTO pos_sync_metadata (company_id, outlet_id, tier, sync_status)
SELECT 
    o.company_id,
    o.id as outlet_id,
    tier_enum.tier,
    'OK' as sync_status
FROM outlets o
CROSS JOIN (
    SELECT 'OPERATIONAL' as tier
    UNION ALL SELECT 'MASTER'
    UNION ALL SELECT 'ADMIN'
) tier_enum
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM pos_sync_metadata psm 
    WHERE psm.company_id = o.company_id AND psm.outlet_id = o.id AND psm.tier = tier_enum.tier
  );