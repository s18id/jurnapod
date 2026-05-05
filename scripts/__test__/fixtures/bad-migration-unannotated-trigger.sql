-- Migration: bad_migration_unannotated_trigger.sql
-- Description: A migration with an unannotated business-logic trigger

SET FOREIGN_KEY_CHECKS=0;

DROP TRIGGER IF EXISTS trg_my_table_before_update;
CREATE TRIGGER trg_my_table_before_update
BEFORE UPDATE ON my_table
FOR EACH ROW
BEGIN
    IF NEW.status = 'FINALIZED' AND OLD.status != 'FINALIZED' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Cannot update finalized records';
    END IF;
END;

DROP TRIGGER IF EXISTS trg_my_table_audit;
CREATE TRIGGER trg_my_table_audit
BEFORE UPDATE ON my_table
FOR EACH ROW
BEGIN
    SET NEW.updated_at = NOW();
END;

SET FOREIGN_KEY_CHECKS=1;
