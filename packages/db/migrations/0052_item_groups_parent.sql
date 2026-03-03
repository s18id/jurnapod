-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

ALTER TABLE item_groups
  ADD COLUMN parent_id BIGINT UNSIGNED DEFAULT NULL AFTER company_id,
  ADD KEY idx_item_groups_company_parent (company_id, parent_id),
  ADD CONSTRAINT fk_item_groups_parent FOREIGN KEY (parent_id) REFERENCES item_groups(id) ON DELETE RESTRICT;
