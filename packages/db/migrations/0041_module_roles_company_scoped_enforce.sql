-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

-- Enforce company-scoped module_roles
ALTER TABLE module_roles
  MODIFY company_id BIGINT UNSIGNED NOT NULL;
