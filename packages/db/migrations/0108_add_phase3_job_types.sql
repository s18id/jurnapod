-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Migration: Add Phase 3 job types to backoffice_sync_queue
-- Add support for scheduled exports, forecasting, and analytics

ALTER TABLE backoffice_sync_queue 
MODIFY COLUMN document_type ENUM(
    'INVOICE', 
    'PAYMENT', 
    'JOURNAL', 
    'REPORT', 
    'RECONCILIATION',
    'SCHEDULED_EXPORT',
    'FORECAST_GENERATION',
    'INSIGHTS_CALCULATION'
) NOT NULL;
