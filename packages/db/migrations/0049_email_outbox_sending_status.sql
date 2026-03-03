-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Add SENDING status to email_outbox to prevent concurrent worker conflicts
-- This allows workers to claim emails before processing them

ALTER TABLE email_outbox 
MODIFY COLUMN status ENUM('PENDING', 'SENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING';
