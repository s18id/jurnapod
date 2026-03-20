-- Add reservation_group_id column to link individual reservations to their group
-- Nullable: single-table reservations don't need a group
-- Safety: ON DELETE SET NULL allows group deletion while preserving individual reservations

ALTER TABLE reservations 
  ADD COLUMN reservation_group_id BIGINT UNSIGNED NULL AFTER outlet_id,
  ADD INDEX idx_reservation_group (reservation_group_id),
  ADD CONSTRAINT fk_reservations_group
    FOREIGN KEY (reservation_group_id) 
    REFERENCES reservation_groups(id) 
    ON DELETE SET NULL;

-- Query optimization for group lookups
CREATE INDEX idx_group_reservations 
  ON reservations(company_id, outlet_id, reservation_group_id);