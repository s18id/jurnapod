-- Drop legacy permission columns after permission_mask rollout
ALTER TABLE module_roles
  DROP COLUMN can_create,
  DROP COLUMN can_read,
  DROP COLUMN can_update,
  DROP COLUMN can_delete;
