-- Create reservation_groups table for multi-table party support
-- Each group tracks multiple reservations that should be managed together
-- 
-- Safety: Uses ON DELETE RESTRICT to prevent accidental deletion of companies/outlets
-- when reservation groups exist. Groups must be explicitly deleted first.
-- 
-- Rollback: Use migration 0113_rollback_reservation_groups.sql to reverse this migration

CREATE TABLE IF NOT EXISTS reservation_groups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  outlet_id BIGINT UNSIGNED NOT NULL,
  group_name VARCHAR(191) NULL COMMENT 'Optional display name, e.g., "Smith Party"',
  total_guest_count INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes for performance
  INDEX idx_company_outlet (company_id, outlet_id),
  INDEX idx_created_at (created_at),
  
  -- Foreign key constraints with RESTRICT (safety: prevents accidental parent deletion)
  CONSTRAINT fk_reservation_groups_company 
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_reservation_groups_outlet 
    FOREIGN KEY (outlet_id) REFERENCES outlets(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
  COMMENT='Groups of multi-table reservations for large parties';