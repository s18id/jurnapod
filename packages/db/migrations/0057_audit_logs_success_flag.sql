-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

ALTER TABLE audit_logs
  ADD COLUMN success TINYINT(1) NOT NULL DEFAULT 1 AFTER result;

UPDATE audit_logs
SET success = IF(result = 'SUCCESS', 1, 0);
