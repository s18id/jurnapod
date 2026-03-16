-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Create sync_audit_events table with partitioning
-- Story: 7.2 - Implement Audit Event Persistence
-- Purpose: Track sync operations for audit and monitoring
-- Note: No foreign keys on partitioned tables (MySQL limitation)
-- Note: Use DATETIME for created_at (not TIMESTAMP) to allow partitioning
-- Referential integrity enforced at application level
-- Portable across MySQL 8.0+ and MariaDB 10.2+

-- ============================================================
-- Drop and recreate sync_audit_events table with partitioning
-- ============================================================

-- Drop the table if it exists (clean slate for rerunnability)
DROP TABLE IF EXISTS sync_audit_events;

-- Create the partitioned table
-- Using DATETIME for created_at to avoid timezone-dependent partitioning issues
CREATE TABLE sync_audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED DEFAULT NULL,
  operation_type VARCHAR(20) NOT NULL,
  tier_name VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  duration_ms INT UNSIGNED DEFAULT NULL,
  items_count INT UNSIGNED DEFAULT NULL,
  version_before BIGINT UNSIGNED DEFAULT NULL,
  version_after BIGINT UNSIGNED DEFAULT NULL,
  error_code VARCHAR(50) DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  client_device_id VARCHAR(255) DEFAULT NULL,
  client_version VARCHAR(50) DEFAULT NULL,
  request_size_bytes INT UNSIGNED DEFAULT NULL,
  response_size_bytes INT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, created_at),
  KEY idx_company_time (company_id, created_at),
  KEY idx_outlet_time (outlet_id, created_at),
  KEY idx_operation (operation_type, status),
  KEY idx_tier (tier_name, created_at),
  KEY idx_status_time (status, created_at),
  CONSTRAINT chk_sync_audit_events_operation_type CHECK (operation_type IN ('PUSH', 'PULL', 'VERSION_BUMP', 'HEALTH_CHECK')),
  CONSTRAINT chk_sync_audit_events_tier_name CHECK (tier_name IN ('REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN', 'ANALYTICS', 'default')),
  CONSTRAINT chk_sync_audit_events_status CHECK (status IN ('SUCCESS', 'FAILED', 'PARTIAL', 'IN_PROGRESS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (YEAR(created_at)) (
  PARTITION p2024 VALUES LESS THAN (2025),
  PARTITION p2025 VALUES LESS THAN (2026),
  PARTITION p2026 VALUES LESS THAN (2027),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);

-- ============================================================
-- Create sync_audit_events_archive table (no partitioning)
-- ============================================================

DROP TABLE IF EXISTS sync_audit_events_archive;

CREATE TABLE sync_audit_events_archive (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED DEFAULT NULL,
  operation_type VARCHAR(20) NOT NULL,
  tier_name VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  duration_ms INT UNSIGNED DEFAULT NULL,
  items_count INT UNSIGNED DEFAULT NULL,
  version_before BIGINT UNSIGNED DEFAULT NULL,
  version_after BIGINT UNSIGNED DEFAULT NULL,
  error_code VARCHAR(50) DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  client_device_id VARCHAR(255) DEFAULT NULL,
  client_version VARCHAR(50) DEFAULT NULL,
  request_size_bytes INT UNSIGNED DEFAULT NULL,
  response_size_bytes INT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_archive_company_time (company_id, created_at),
  KEY idx_archive_outlet_time (outlet_id, created_at),
  KEY idx_archive_operation (operation_type, status),
  KEY idx_archive_tier (tier_name, created_at),
  KEY idx_archive_status_time (status, created_at),
  KEY idx_archive_archived_at (archived_at),
  CONSTRAINT chk_archive_sync_audit_events_operation_type CHECK (operation_type IN ('PUSH', 'PULL', 'VERSION_BUMP', 'HEALTH_CHECK')),
  CONSTRAINT chk_archive_sync_audit_events_tier_name CHECK (tier_name IN ('REALTIME', 'OPERATIONAL', 'MASTER', 'ADMIN', 'ANALYTICS', 'default')),
  CONSTRAINT chk_archive_sync_audit_events_status CHECK (status IN ('SUCCESS', 'FAILED', 'PARTIAL', 'IN_PROGRESS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
