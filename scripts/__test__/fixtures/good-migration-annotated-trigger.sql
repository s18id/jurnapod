-- Migration: good_migration_annotated_trigger.sql
-- Description: A migration with an annotated allowed business-logic trigger

SET FOREIGN_KEY_CHECKS=0;

DROP TRIGGER IF EXISTS trg_invoice_before_delete;
-- lint:allow-business-trigger
CREATE TRIGGER trg_invoice_before_delete
BEFORE DELETE ON invoices
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'Invoices are append-only: DELETE is not allowed';

SET FOREIGN_KEY_CHECKS=1;
