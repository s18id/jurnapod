-- Add permission mask to module_roles (create=1, read=2, update=4, delete=8)
ALTER TABLE module_roles
  ADD COLUMN permission_mask INT NOT NULL DEFAULT 0
    COMMENT 'Permission bits: create=1, read=2, update=4, delete=8';

-- Backfill mask from existing can_* columns
UPDATE module_roles
SET permission_mask =
  (IFNULL(can_create, 0) * 1) |
  (IFNULL(can_read, 0) * 2) |
  (IFNULL(can_update, 0) * 4) |
  (IFNULL(can_delete, 0) * 8);
