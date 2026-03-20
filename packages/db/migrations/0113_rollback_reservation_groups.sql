-- Rollback migration for 0111 and 0112
-- Removes reservation_group_id column and reservation_groups table
-- Safe reversal of multi-table reservation support

-- Remove group_id column from reservations
ALTER TABLE reservations 
  DROP FOREIGN KEY IF EXISTS fk_reservations_group,
  DROP INDEX IF EXISTS idx_reservation_group,
  DROP INDEX IF EXISTS idx_group_reservations,
  DROP COLUMN IF EXISTS reservation_group_id;

-- Drop reservation_groups table
DROP TABLE IF EXISTS reservation_groups;