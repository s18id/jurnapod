-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- ============================================================
-- Migration: Add timezone support to companies table
-- ============================================================

-- Add timezone column to companies table
ALTER TABLE companies 
  ADD COLUMN timezone VARCHAR(50) NULL DEFAULT 'UTC' 
  AFTER email;

-- Create index for timezone lookups
CREATE INDEX idx_companies_timezone ON companies(timezone);

-- ============================================================
-- Notes:
-- - timezone column stores IANA timezone identifiers (e.g., 'Asia/Jakarta', 'America/New_York')
-- - NULL defaults to 'UTC' for backward compatibility
-- - Used by application layer for date/time conversions
-- ============================================================
