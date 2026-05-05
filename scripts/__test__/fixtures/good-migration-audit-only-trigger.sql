-- Migration: good_migration_audit_only_trigger.sql
-- Description: A migration with audit-only triggers (SET NEW.field without SIGNAL)

SET FOREIGN_KEY_CHECKS=0;

DROP TRIGGER IF EXISTS trg_items_before_update;
CREATE TRIGGER trg_items_before_update
BEFORE UPDATE ON items
FOR EACH ROW
BEGIN
    SET NEW.updated_at = NOW();
    SET NEW.updated_by = @current_user_id;
END;

DROP TRIGGER IF EXISTS trg_items_before_insert;
CREATE TRIGGER trg_items_before_insert
BEFORE INSERT ON items
FOR EACH ROW
BEGIN
    IF NEW.created_at IS NULL THEN
        SET NEW.created_at = NOW();
    END IF;
    SET NEW.updated_at = NOW();
END;

SET FOREIGN_KEY_CHECKS=1;
