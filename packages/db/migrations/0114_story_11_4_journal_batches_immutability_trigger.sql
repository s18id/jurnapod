-- Migration: 0114_story_11_4_journal_batches_immutability_trigger.sql
-- Story: 11.4 Posting Correctness and Reconciliation Guardrails
-- Description: Add BEFORE UPDATE/BEFORE DELETE triggers to enforce immutability on journal_batches and journal_lines.
--              Finalized financial records cannot be modified or deleted - corrections must use
--              VOID/REFUND patterns that create new entries instead of modifying existing ones.
-- Compatible with: MySQL 8.0+, MariaDB 10.2+

SET FOREIGN_KEY_CHECKS=0;

-- =====================================================
-- journal_batches triggers
-- =====================================================

DROP TRIGGER IF EXISTS trg_journal_batches_before_update;
CREATE TRIGGER trg_journal_batches_before_update
BEFORE UPDATE ON journal_batches
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'Cannot modify journal_batches: records are immutable. Use VOID or REFUND patterns to correct errors.';

DROP TRIGGER IF EXISTS trg_journal_batches_before_delete;
CREATE TRIGGER trg_journal_batches_before_delete
BEFORE DELETE ON journal_batches
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'Cannot delete from journal_batches: records are immutable. Use VOID patterns to nullify entries.';

-- =====================================================
-- journal_lines triggers
-- =====================================================

DROP TRIGGER IF EXISTS trg_journal_lines_before_update;
CREATE TRIGGER trg_journal_lines_before_update
BEFORE UPDATE ON journal_lines
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'Cannot modify journal_lines: records are immutable. Use VOID or REFUND patterns to correct errors.';

DROP TRIGGER IF EXISTS trg_journal_lines_before_delete;
CREATE TRIGGER trg_journal_lines_before_delete
BEFORE DELETE ON journal_lines
FOR EACH ROW
SIGNAL SQLSTATE '45000'
SET MESSAGE_TEXT = 'Cannot delete from journal_lines: records are immutable. Use VOID patterns to nullify entries.';

SET FOREIGN_KEY_CHECKS=1;

-- Note: These triggers enforce immutability at the database level.
-- For corrections, use the VOID/REFUND patterns documented in:
-- docs/checklists/posting-correction-patterns.md
